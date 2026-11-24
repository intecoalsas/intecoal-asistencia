/**
 * POST /api/cron/cierre-semanal
 *
 * Endpoint de automatización de cierres semanales del módulo Historial.
 * Diseñado para ser invocado por un disparador externo (AWS EventBridge,
 * cron del SO, etc.) cada lunes a las 00:00 hora de Bogotá.
 *
 * ─── Seguridad ───────────────────────────────────────────────────────────────
 * Requiere el encabezado:
 *   Authorization: Bearer <CRON_SECRET>
 * donde CRON_SECRET está definido en .env / variables de entorno.
 * Las solicitudes sin secreto válido reciben HTTP 401.
 * El secreto NUNCA se incluye en logs ni en la respuesta.
 *
 * ─── Lógica de procesamiento ─────────────────────────────────────────────────
 * 1. Detectar períodos pendientes (ABIERTA / PENDIENTE_CIERRE sin intento activo)
 *    y períodos con intentos abandonados.
 * 2. Filtrar: solo semanas cuyo finSemana sea anterior al inicio de la semana
 *    actual en Bogotá. Nunca cierra la semana en curso ni semanas futuras.
 * 3. Para cada período candidato:
 *    a. Si tiene cierre exitoso sin consolidado → recuperarConsolidacion().
 *    b. Si tiene intento abandonado → reconciliarIntentoAbandonado().
 *       - Si el resultado contiene REVISION_REQUERIDA → omitir, registrar.
 *       - Si es FALLO limpio → intentar cerrar.
 *    c. Si no tiene cierre ni intento → ejecutarCierrePeriodo().
 * 4. Responder con resumen JSON de períodos procesados, omitidos y con error.
 *
 * ─── Idempotencia ────────────────────────────────────────────────────────────
 * Los servicios subyacentes (cerrarPeriodo, consolidarPeriodo) son idempotentes.
 * Una segunda llamada en el mismo lunes no duplica cierres ni consolidados.
 *
 * ─── No crea infraestructura nueva ───────────────────────────────────────────
 * Los errores y resultados quedan en ClosureAttempt.errorMsg.
 * No envía correos, no usa AttendanceAuditLog, no requiere dependencias nuevas.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bearerCoincide, leerSecreto } from "@/lib/secrets";
import { getInicioSemana } from "@/modules/historial";
import {
  detectarPeriodosPendientes,
  ejecutarCierrePeriodo,
  reconciliarIntentoAbandonado,
  UMBRAL_ABANDONO_MS,
} from "@/modules/historial";
import { recuperarConsolidacion } from "@/modules/historial";
import { HistorialError } from "@/modules/historial";
import { ResultadoIntento } from "@prisma/client";

// ---------------------------------------------------------------------------
// Tipos internos de respuesta
// ---------------------------------------------------------------------------

type EstadoProceso =
  | "CERRADO_OK"
  | "CONSOLIDADO_RECUPERADO"
  | "RECONCILIADO_FALLO"
  | "REVISION_REQUERIDA"
  | "ERROR";

interface ResultadoPeriodo {
  weeklyPeriodId: string;
  inicioSemana: string;
  finSemana: string;
  estado: EstadoProceso;
  detalle?: string;
}

interface RespuestaCron {
  ejecutadoEn: string;
  inicioSemanaActual: string;
  totalCandidatos: number;
  procesados: ResultadoPeriodo[];
  omitidos: ResultadoPeriodo[];
  revisionRequerida: ResultadoPeriodo[];
  errores: ResultadoPeriodo[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Formatea un Date UTC como "YYYY-MM-DD" sin depender del TZ del SO. */
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Verifica la presencia y validez del Bearer token. */
function autenticarCron(req: NextRequest): boolean {
  // En producción, un CRON_SECRET ausente o de ejemplo lanza error explícito.
  const cronSecret = leerSecreto("CRON_SECRET");
  if (!cronSecret) {
    // Sin CRON_SECRET configurado en servidor → rechazar siempre por seguridad.
    return false;
  }
  return bearerCoincide(req.headers.get("authorization"), cronSecret);
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ── 1. Autenticación ──────────────────────────────────────────────────────
  if (!autenticarCron(req)) {
    return NextResponse.json(
      { error: "No autorizado. Se requiere Bearer token válido en Authorization." },
      { status: 401 }
    );
  }

  const ejecutadoEn = new Date();

  // ── 2. Calcular límite temporal (Bogotá) ──────────────────────────────────
  // Inicio de la semana ACTUAL en Bogotá (lunes 00:00 UTC normalizado).
  // Solo se procesan períodos cuyo finSemana < inicioSemanaActual.
  const inicioSemanaActual = getInicioSemana(ejecutadoEn);

  // ── 3. Detectar candidatos ────────────────────────────────────────────────
  const pendientes = await detectarPeriodosPendientes({
    umbralAbandonoMs: UMBRAL_ABANDONO_MS,
  });

  // Filtrar: solo semanas cuya finSemana ya haya terminado (< inicio de esta semana).
  // Excluye la semana en curso y cualquier semana futura.
  const candidatos = pendientes.filter(
    (p) => p.periodo.finSemana < inicioSemanaActual
  );

  const procesados: ResultadoPeriodo[] = [];
  const omitidos: ResultadoPeriodo[] = [];
  const revisionRequerida: ResultadoPeriodo[] = [];
  const errores: ResultadoPeriodo[] = [];

  // ── 4. Procesar cada candidato ────────────────────────────────────────────
  for (const candidato of candidatos) {
    const { periodo, intentoAbandonado, cierreExistenteId } = candidato;
    const base = {
      weeklyPeriodId: periodo.id,
      inicioSemana: isoDate(periodo.inicioSemana),
      finSemana: isoDate(periodo.finSemana),
    };

    // ── Caso A: cierre exitoso ya existe pero falta consolidación ─────────
    // Se detecta verificando si el cierreExistente tiene 0 consolidados.
    if (cierreExistenteId) {
      try {
        const conteo = await db.weeklyConsolidadoDia.count({
          where: { weeklyClosureId: cierreExistenteId },
        });

        if (conteo === 0) {
          // Consolidación pendiente: recuperar sobre el cierre existente.
          await recuperarConsolidacion(cierreExistenteId, periodo.id);
          procesados.push({
            ...base,
            estado: "CONSOLIDADO_RECUPERADO",
            detalle: `Consolidación recuperada sobre cierreId=${cierreExistenteId}`,
          });
          continue;
        }

        // Tiene cierre y consolidados: ya está completo, no procesar.
        omitidos.push({
          ...base,
          estado: "CERRADO_OK",
          detalle: "Ya tiene cierre exitoso y consolidación completa.",
        });
        continue;
      } catch (err) {
        errores.push({
          ...base,
          estado: "ERROR",
          detalle: `Error verificando/recuperando consolidación: ${
            err instanceof Error ? err.message : String(err)
          }`,
        });
        continue;
      }
    }

    // ── Caso B: hay intento abandonado ────────────────────────────────────
    if (intentoAbandonado) {
      try {
        const intentoReconciliado = await reconciliarIntentoAbandonado(
          intentoAbandonado,
          periodo.id
        );

        const errorMsg = intentoReconciliado.errorMsg ?? "";
        const esRevisionRequerida = errorMsg.includes("REVISION_REQUERIDA");

        if (esRevisionRequerida) {
          // No reintentar: dejar para revisión manual del ADMIN.
          revisionRequerida.push({
            ...base,
            estado: "REVISION_REQUERIDA",
            detalle: `Intento ${intentoAbandonado.intentoNum} marcado para revisión manual. Ver ClosureAttempt id=${intentoAbandonado.id}.`,
          });
          continue;
        }

        // FALLO limpio (sin REVISION_REQUERIDA): el cierre no ocurrió.
        // Intentar un cierre nuevo.
      } catch (err) {
        errores.push({
          ...base,
          estado: "ERROR",
          detalle: `Error reconciliando intento abandonado (intentoNum=${intentoAbandonado.intentoNum}): ${
            err instanceof Error ? err.message : String(err)
          }`,
        });
        continue;
      }
    }

    // ── Caso C: ejecutar cierre nuevo ────────────────────────────────────
    try {
      await ejecutarCierrePeriodo({
        weeklyPeriodId: periodo.id,
        tipo: "AUTOMATICO",
        actorId: null,
        motivo: `Cierre automático generado por scheduler (${isoDate(ejecutadoEn)})`,
      });

      procesados.push({
        ...base,
        estado: "CERRADO_OK",
        detalle: "Cierre y consolidación completados.",
      });
    } catch (err) {
      const mensaje = err instanceof HistorialError
        ? `HistorialError(${err.code}): ${err.message}`
        : err instanceof Error
          ? err.message
          : String(err);

      errores.push({
        ...base,
        estado: "ERROR",
        detalle: `Error al ejecutar cierre: ${mensaje}`,
      });
    }
  }

  // ── 5. Respuesta ──────────────────────────────────────────────────────────
  const respuesta: RespuestaCron = {
    ejecutadoEn: ejecutadoEn.toISOString(),
    inicioSemanaActual: isoDate(inicioSemanaActual),
    totalCandidatos: candidatos.length,
    procesados,
    omitidos,
    revisionRequerida,
    errores,
  };

  const httpStatus = errores.length > 0 ? 207 : 200;

  return NextResponse.json(respuesta, { status: httpStatus });
}

// ---------------------------------------------------------------------------
// Rechazar métodos no permitidos
// ---------------------------------------------------------------------------

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    { error: "Método no permitido. Use POST." },
    { status: 405, headers: { Allow: "POST" } }
  );
}

export async function PUT(): Promise<NextResponse> {
  return NextResponse.json(
    { error: "Método no permitido. Use POST." },
    { status: 405, headers: { Allow: "POST" } }
  );
}

export async function DELETE(): Promise<NextResponse> {
  return NextResponse.json(
    { error: "Método no permitido. Use POST." },
    { status: 405, headers: { Allow: "POST" } }
  );
}
