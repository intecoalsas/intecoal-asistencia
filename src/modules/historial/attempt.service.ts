/**
 * Módulo Historial — Servicio de Intentos de Cierre (ClosureAttempt)
 *
 * Responsabilidades:
 *  - ejecutarCierrePeriodo: orquesta un intento completo (registro → cierre → resultado).
 *  - reconciliarIntentoAbandonado: corrige un intento EN_PROGRESO abandonado.
 *  - detectarPeriodosPendientes: lista períodos pendientes de cierre o reconciliación.
 *
 * ─── Diseño de concurrencia (corregido en Fase 3.2-fix) ─────────────────────
 *
 *  La detección de intento activo y la creación del nuevo intento se ejecutan
 *  DENTRO de la misma transacción Serializable, bloqueando la fila de WeeklyPeriod
 *  con SELECT … FOR UPDATE antes de cualquier lectura de ClosureAttempt.
 *  Esto garantiza exclusión mutua incluso entre instancias independientes del
 *  proceso, sin depender de un pre-check externo a la transacción.
 *
 *  Flujo dentro de la transacción:
 *   a. SELECT … FOR UPDATE en weekly_periods (bloqueo de fila)
 *   b. Verificar estado del período (cerrable o no)
 *   c. Verificar ausencia de intento EN_PROGRESO activo
 *   d. Calcular MAX(intentoNum) + 1
 *   e. INSERT en closure_attempts
 *
 * ─── Reconciliación de intentos abandonados (corregida en Fase 3.2-fix) ─────
 *
 *  Problema anterior: se atribuía EXITO a cualquier cierre posterior por fecha,
 *  incluyendo cierres realizados por operaciones independientes o tras reaperturas.
 *
 *  Solución: sin FK directa entre ClosureAttempt y WeeklyClosure (no modificable
 *  sin cambio de schema), la reconciliación NO puede demostrar causalidad. Por ello:
 *
 *   - Si el período está ABIERTA/PENDIENTE_CIERRE/REABIERTA: no hay cierre que
 *     atribuir → FALLO.
 *   - Si el período está CERRADA Y existe exactamente UN cierre exitoso creado
 *     dentro de la ventana temporal del intento (sin reaperturas intermedias):
 *     se marca REVISION_REQUERIDA con contexto, para que un operador confirme.
 *   - En cualquier otro caso (múltiples cierres, reaperturas, ambigüedad): FALLO
 *     con mensaje descriptivo.
 *
 *  LIMITACIÓN DOCUMENTADA: la reconciliación definitiva requiere una FK
 *  weeklyClosureId en ClosureAttempt. Sin ese campo no es posible demostrar
 *  causalidad de forma automática y segura. Cuando se autorice la modificación
 *  del schema, se debe: (1) añadir weeklyClosureId nullable en ClosureAttempt,
 *  (2) poblarlo en ejecutarCierrePeriodo tras el cierre exitoso, (3) usarlo
 *  en reconciliarIntentoAbandonado para confirmar EXITO con certeza.
 */

import {
  ClosureAttempt,
  WeeklyPeriod,
  EstadoPeriodo,
  ResultadoIntento,
  TipoCierre,
  Prisma,
} from "@prisma/client";
import { db } from "@/lib/db";
import { cerrarPeriodo, HistorialError } from "./closure.service";
import type { HistorialErrorCode } from "./closure.service";
import { consolidarPeriodo } from "./consolidado.service";

/**
 * Resultado posible de reconciliación cuando no hay evidencia causal suficiente.
 * El intento queda en FALLO con errorMsg descriptivo para revisión manual.
 * En el futuro, cuando el schema incluya weeklyClosureId en ClosureAttempt,
 * este caso podrá resolverse automáticamente.
 */
export type ReconciliacionResultado = "EXITO" | "FALLO" | "REVISION_REQUERIDA";

// ---------------------------------------------------------------------------
// Configuración
// ---------------------------------------------------------------------------

/**
 * Un intento EN_PROGRESO cuyo `iniciado` supera este umbral (ms) se considera
 * abandonado y es elegible para reconciliación. Valor por defecto: 10 minutos.
 * El scheduler puede sobrescribirlo al llamar a las funciones.
 */
export const UMBRAL_ABANDONO_MS = 10 * 60 * 1000; // 10 minutos

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export interface EjecutarCierreInput {
  weeklyPeriodId: string;
  tipo: TipoCierre;
  /** Null para cierres automáticos. UUID del user para cierres manuales. */
  actorId: string | null;
  motivo?: string;
  /** Umbral de abandono en ms para detectar intentos en progreso activos. */
  umbralAbandonoMs?: number;
}

export interface EjecutarCierreResult {
  intento: ClosureAttempt;
  /** Presente si el cierre se completó en esta ejecución. */
  cierreId?: string;
  /** Presente si el intento fue reconciliado (ya existía un cierre previo). */
  reconciliado?: boolean;
}

export interface PeriodoPendiente {
  periodo: WeeklyPeriod;
  /** Último intento EN_PROGRESO (abandonado) si existe. */
  intentoAbandonado?: ClosureAttempt;
  /** Cierre exitoso ya registrado (para reconciliación). */
  cierreExistenteId?: string;
}

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

/** Calcula el MAX(intentoNum) para un período y devuelve el siguiente. */
async function nextIntentoNum(
  tx: Prisma.TransactionClient,
  weeklyPeriodId: string
): Promise<number> {
  const agg = await tx.closureAttempt.aggregate({
    where: { weeklyPeriodId },
    _max: { intentoNum: true },
  });
  return (agg._max.intentoNum ?? 0) + 1;
}

/** Lanzar error de colisión única de Prisma como HistorialError CONFLICT. */
function wrapConflict(err: unknown): never {
  if (err instanceof HistorialError) throw err;
  const e = err as { code?: string; message?: string };
  if (
    e.code === "P2002" ||
    e.code === "P2034" ||
    e.message?.includes("deadlock") ||
    e.message?.includes("serialize") ||
    e.message?.includes("Unique constraint")
  ) {
    throw new HistorialError(
      "CONFLICT" as HistorialErrorCode,
      "Conflicto de concurrencia en intento de cierre. Reintente la operación."
    );
  }
  throw err;
}

// ---------------------------------------------------------------------------
// Operación principal: ejecutar cierre con registro de intento
// ---------------------------------------------------------------------------

/**
 * Orquesta un intento de cierre completo con exclusión mutua garantizada en BD.
 *
 * Flujo:
 *  1. Validación inicial rápida fuera de transacción (existencia del período).
 *  2. Para períodos CERRADA/REABIERTA: reconciliar intento abandonado si existe.
 *  3. Dentro de una transacción Serializable con SELECT FOR UPDATE en weekly_periods:
 *     a. Bloquear la fila del período (exclusión mutua entre instancias).
 *     b. Re-verificar estado (puede haber cambiado antes de obtener el lock).
 *     c. Verificar ausencia de intento EN_PROGRESO activo (dentro del lock).
 *     d. Calcular MAX(intentoNum) + 1.
 *     e. INSERT en closure_attempts.
 *  4. Ejecutar cerrarPeriodo (servicio existente, sin reimplementar).
 *  5. Actualizar el intento a EXITO o FALLO.
 *
 * Concurrencia:
 *  El SELECT FOR UPDATE en weekly_periods bloquea la fila desde el paso 3a
 *  hasta el commit. Una segunda instancia que ejecute el mismo paso esperará,
 *  garantizando que el pre-check (3c) y la creación del intento (3e) sean
 *  atómicos respecto a otras instancias. No requiere Redis ni infraestructura
 *  adicional.
 */
export async function ejecutarCierrePeriodo(
  input: EjecutarCierreInput
): Promise<EjecutarCierreResult> {
  const umbral = input.umbralAbandonoMs ?? UMBRAL_ABANDONO_MS;
  const ahora  = new Date();
  const umbralFecha = new Date(ahora.getTime() - umbral);

  // ── Paso 1: validación rápida fuera de la transacción ────────────────────
  const periodoInicial = await db.weeklyPeriod.findUnique({
    where: { id: input.weeklyPeriodId },
  });

  if (!periodoInicial) {
    throw new HistorialError(
      "PERIOD_NOT_FOUND",
      `Período ${input.weeklyPeriodId} no encontrado.`
    );
  }

  // ── Paso 2: rechazo rápido para estados protegidos ───────────────────────
  if (
    periodoInicial.estado === EstadoPeriodo.CERRADA ||
    periodoInicial.estado === EstadoPeriodo.REABIERTA
  ) {
    const abandonado = await db.closureAttempt.findFirst({
      where: {
        weeklyPeriodId: input.weeklyPeriodId,
        resultado: ResultadoIntento.EN_PROGRESO,
        iniciado: { lt: umbralFecha },
      },
      orderBy: { intentoNum: "desc" },
    });

    if (abandonado) {
      const reconciliado = await reconciliarIntentoAbandonado(
        abandonado,
        input.weeklyPeriodId
      );
      return { intento: reconciliado, reconciliado: true };
    }

    throw new HistorialError(
      "INVALID_STATE",
      `No se puede iniciar un cierre sobre un período en estado ${periodoInicial.estado}.`
    );
  }

  // ── Paso 3: transacción Serializable con SELECT FOR UPDATE ───────────────
  // El lock sobre weekly_periods garantiza exclusión mutua entre instancias.
  let intento: ClosureAttempt;
  try {
    intento = await db.$transaction(
      async (tx) => {
        // 3a. Bloquear la fila con SELECT FOR UPDATE
        const rows = await tx.$queryRaw<{ id: string; estado: string }[]>`
          SELECT id, estado FROM weekly_periods
          WHERE id = ${input.weeklyPeriodId}
          FOR UPDATE
        `;

        if (rows.length === 0) {
          throw new HistorialError(
            "PERIOD_NOT_FOUND",
            `Período ${input.weeklyPeriodId} no encontrado dentro de la transacción.`
          );
        }

        // 3b. Re-verificar estado bajo bloqueo
        const estadoActual = rows[0].estado as EstadoPeriodo;
        if (
          estadoActual === EstadoPeriodo.CERRADA ||
          estadoActual === EstadoPeriodo.REABIERTA
        ) {
          throw new HistorialError(
            "INVALID_STATE",
            `El período cambió a estado ${estadoActual} antes de crear el intento.`
          );
        }

        // 3c. Verificar ausencia de intento EN_PROGRESO activo (dentro del lock)
        const intentoActivo = await tx.closureAttempt.findFirst({
          where: {
            weeklyPeriodId: input.weeklyPeriodId,
            resultado: ResultadoIntento.EN_PROGRESO,
            iniciado: { gte: umbralFecha },
          },
          orderBy: { intentoNum: "desc" },
        });

        if (intentoActivo) {
          throw new HistorialError(
            "CONFLICT",
            `Ya existe un intento activo (intentoNum=${intentoActivo.intentoNum}, ` +
              `iniciado=${intentoActivo.iniciado.toISOString()}). ` +
              "Espere o reconcilie antes de reintentar."
          );
        }

        // 3d. Número consecutivo de intento
        const intentoNum = await nextIntentoNum(tx, input.weeklyPeriodId);

        // 3e. Crear el intento EN_PROGRESO
        return tx.closureAttempt.create({
          data: {
            weeklyPeriodId: input.weeklyPeriodId,
            intentoNum,
            resultado: ResultadoIntento.EN_PROGRESO,
            iniciado: ahora,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  } catch (err) {
    wrapConflict(err);
  }

  // ── Paso 4: ejecutar el cierre (servicio existente) ───────────────────────
  let cierreId: string | undefined;
  let errorMsg: string | undefined;

  try {
    const { cierre } = await cerrarPeriodo({
      weeklyPeriodId: input.weeklyPeriodId,
      tipo: input.tipo,
      actorId: input.actorId,
      motivo: input.motivo,
    });
    cierreId = cierre.id;
  } catch (err) {
    if (err instanceof HistorialError) {
      errorMsg = `CIERRE_FALLIDO: HistorialError(${err.code}): ${err.message}`;
    } else {
      errorMsg = `CIERRE_FALLIDO: ${String(err)}`;
    }
  }

  // ── Paso 4b: consolidar (idempotente, independiente del commit del cierre) ─
  // El cierre ya está comprometido en BD. Un fallo aquí NO lo revierte.
  if (cierreId) {
    try {
      await consolidarPeriodo(cierreId, input.weeklyPeriodId);
    } catch (err) {
      errorMsg =
        `CONSOLIDACION_FALLIDA (cierreId=${cierreId}): ` +
        (err instanceof Error ? err.message : String(err));
    }
  }

  // ── Paso 5: registrar el resultado real ───────────────────────────────────
  const finalizado = new Date();
  // EXITO solo si el cierre se creó Y la consolidación fue exitosa
  const resultado = cierreId && !errorMsg
    ? ResultadoIntento.EXITO
    : ResultadoIntento.FALLO;

  const intentoFinal = await db.closureAttempt.update({
    where: { id: intento!.id },
    data: {
      resultado,
      finalizado,
      errorMsg: errorMsg ?? null,
    },
  });

  if (errorMsg) {
    const isClosureFailed = !cierreId;
    const context = isClosureFailed
      ? `Intento ${intento!.intentoNum} FALLO en cierre`
      : `Intento ${intento!.intentoNum} FALLO en consolidación (cierreId=${cierreId})`;
    throw new HistorialError(
      "CONFLICT",
      `${context}. Error: ${errorMsg}`
    );
  }

  return { intento: intentoFinal, cierreId };
}

// ---------------------------------------------------------------------------
// Reconciliación de intentos abandonados
// ---------------------------------------------------------------------------

/**
 * Reconcilia un ClosureAttempt abandonado (EN_PROGRESO superando el umbral).
 *
 * Estrategia conservadora — nunca marca EXITO sin evidencia causal suficiente.
 *
 * CASO 1 — Período no cerrado (ABIERTA / PENDIENTE_CIERRE / REABIERTA):
 *   No existe cierre que atribuir → FALLO.
 *
 * CASO 2 — Período CERRADA, exactamente un cierre posterior al intento
 *   y sin reaperturas intermedias entre intento.iniciado y ese cierre:
 *   Hay indicios de causalidad, pero sin FK directa (weeklyClosureId) no
 *   hay certeza. Se marca FALLO con errorMsg "REVISION_REQUERIDA" para
 *   que un operador confirme manualmente.
 *
 * CASO 3 — Múltiples cierres posteriores o reapertura intermedia:
 *   Ambigüedad clara → FALLO con mensaje descriptivo.
 *
 * LIMITACIÓN DOCUMENTADA: la reconciliación automática definitiva requiere
 * añadir weeklyClosureId (nullable) en ClosureAttempt. Sin ese campo no es
 * posible demostrar causalidad de forma automatizada y segura. Cuando se
 * autorice el cambio de schema, debe: (1) añadir weeklyClosureId nullable
 * en ClosureAttempt, (2) poblarlo en ejecutarCierrePeriodo tras el cierre
 * exitoso, (3) usarlo aquí para confirmar EXITO con certeza absoluta.
 *
 * Esta función nunca crea ni modifica WeeklyClosure.
 */
export async function reconciliarIntentoAbandonado(
  intento: ClosureAttempt,
  weeklyPeriodId: string
): Promise<ClosureAttempt> {
  // Leer el estado actual del período
  const periodo = await db.weeklyPeriod.findUnique({
    where: { id: weeklyPeriodId },
    select: { estado: true },
  });

  // ── CASO 1: período no cerrado ────────────────────────────────────────────
  if (!periodo || periodo.estado !== EstadoPeriodo.CERRADA) {
    return db.closureAttempt.update({
      where: { id: intento.id },
      data: {
        resultado: ResultadoIntento.FALLO,
        finalizado: new Date(),
        errorMsg:
          `Intento reconciliado como FALLO: período en estado ` +
          `${periodo?.estado ?? "no encontrado"} — el cierre no se completó.`,
      },
    });
  }

  // Todos los cierres exitosos creados desde el inicio del intento
  const cierresPostIntento = await db.weeklyClosure.findMany({
    where: {
      weeklyPeriodId,
      exitoso: true,
      createdAt: { gte: intento.iniciado },
    },
    orderBy: { version: "asc" },
  });

  // ── CASO 1-b: ningún cierre posterior al intento ──────────────────────────
  if (cierresPostIntento.length === 0) {
    return db.closureAttempt.update({
      where: { id: intento.id },
      data: {
        resultado: ResultadoIntento.FALLO,
        finalizado: new Date(),
        errorMsg:
          "Intento reconciliado como FALLO: no existe ningún cierre exitoso " +
          "posterior al inicio del intento. El proceso se interrumpió antes de cerrar.",
      },
    });
  }

  // Detectar si hubo reaperturas entre el inicio del intento y el primer cierre posterior
  // Nota: el filtro JSON path de Prisma/MySQL no siempre es compatible en todas las versiones.
  // Se trae la lista de reaperturas por acción y ventana temporal y se filtra en memoria.
  const reaperturasVentana = await db.attendanceAuditLog.findMany({
    where: {
      accion: "REOPEN_WEEKLY_PERIOD",
      createdAt: {
        gte: intento.iniciado,
        lte: cierresPostIntento[0].createdAt,
      },
    },
    select: { id: true, valoresAnteriores: true },
  });

  const reaperturaIntermedia = reaperturasVentana.find((log) => {
    const v = log.valoresAnteriores as Record<string, unknown> | null;
    return v && v["weeklyPeriodId"] === weeklyPeriodId;
  });

  // ── CASO 3: múltiples cierres o reapertura intermedia ────────────────────
  if (cierresPostIntento.length > 1 || reaperturaIntermedia) {
    const detalle = reaperturaIntermedia
      ? "hubo una reapertura entre el inicio del intento y el cierre encontrado"
      : `se encontraron ${cierresPostIntento.length} cierres posteriores al intento`;

    return db.closureAttempt.update({
      where: { id: intento.id },
      data: {
        resultado: ResultadoIntento.FALLO,
        finalizado: new Date(),
        errorMsg:
          `Intento marcado FALLO por ambigüedad causal (${detalle}). ` +
          "REVISION_REQUERIDA: verificar manualmente si el intento produjo el cierre. " +
          "Para reconciliación automática definitiva se requiere weeklyClosureId en ClosureAttempt.",
      },
    });
  }

  // ── CASO 2: exactamente un cierre posterior, sin reapertura intermedia ────
  // Indicios de causalidad pero sin FK directa no hay certeza → FALLO con tag.
  const cierreUnico = cierresPostIntento[0];
  return db.closureAttempt.update({
    where: { id: intento.id },
    data: {
      resultado: ResultadoIntento.FALLO,
      finalizado: cierreUnico.cerradoEn,
      errorMsg:
        `REVISION_REQUERIDA: existe 1 cierre posterior (v${cierreUnico.version}, ` +
        `createdAt=${cierreUnico.createdAt.toISOString()}) que podría corresponder ` +
        "a este intento, pero no se puede confirmar causalidad sin weeklyClosureId en ClosureAttempt. " +
        "Revisar manualmente y actualizar si procede.",
    },
  });
}

// ---------------------------------------------------------------------------
// Detección de pendientes
// ---------------------------------------------------------------------------

/**
 * Devuelve períodos que requieren atención para un cierre:
 *
 *  1. Períodos en ABIERTA o PENDIENTE_CIERRE sin intentos recientes EN_PROGRESO activos.
 *  2. Períodos con intentos EN_PROGRESO que superaron el umbral de abandono
 *     (candidatos a reconciliación).
 *
 * Esta función es de solo lectura. No ejecuta cierres ni modifica datos.
 */
export async function detectarPeriodosPendientes(
  opciones: { umbralAbandonoMs?: number } = {}
): Promise<PeriodoPendiente[]> {
  const umbral = opciones.umbralAbandonoMs ?? UMBRAL_ABANDONO_MS;
  const ahora = new Date();
  const umbralFecha = new Date(ahora.getTime() - umbral);

  const pendientes: PeriodoPendiente[] = [];

  // ── Caso A: períodos en estados cerrables sin intento activo ─────────────
  const periodosAbiertos = await db.weeklyPeriod.findMany({
    where: {
      estado: {
        in: [EstadoPeriodo.ABIERTA, EstadoPeriodo.PENDIENTE_CIERRE],
      },
    },
    orderBy: { inicioSemana: "asc" },
  });

  for (const periodo of periodosAbiertos) {
    // Verificar que no haya un intento activo (en progreso y reciente)
    const activo = await db.closureAttempt.findFirst({
      where: {
        weeklyPeriodId: periodo.id,
        resultado: ResultadoIntento.EN_PROGRESO,
        iniciado: { gte: umbralFecha },
      },
    });

    if (!activo) {
      // Verificar si tiene un intento abandonado
      const abandonado = await db.closureAttempt.findFirst({
        where: {
          weeklyPeriodId: periodo.id,
          resultado: ResultadoIntento.EN_PROGRESO,
          iniciado: { lt: umbralFecha },
        },
        orderBy: { intentoNum: "desc" },
      });

      // Verificar si existe cierre exitoso (para reconciliación)
      const cierreExistente = await db.weeklyClosure.findFirst({
        where: { weeklyPeriodId: periodo.id, exitoso: true },
        orderBy: { version: "desc" },
      });

      pendientes.push({
        periodo,
        intentoAbandonado: abandonado ?? undefined,
        cierreExistenteId: cierreExistente?.id,
      });
    }
  }

  // ── Caso B: períodos con intentos abandonados (cualquier estado) ──────────
  // Intentos EN_PROGRESO cuyo período no fue capturado en el caso A
  const intentosAbandonados = await db.closureAttempt.findMany({
    where: {
      resultado: ResultadoIntento.EN_PROGRESO,
      iniciado: { lt: umbralFecha },
    },
    include: { weeklyPeriod: true },
    orderBy: { iniciado: "asc" },
  });

  for (const intento of intentosAbandonados) {
    // Evitar duplicar con caso A
    const yaIncluido = pendientes.some(
      (p) => p.periodo.id === intento.weeklyPeriodId
    );
    if (yaIncluido) continue;

    const cierreExistente = await db.weeklyClosure.findFirst({
      where: { weeklyPeriodId: intento.weeklyPeriodId, exitoso: true },
      orderBy: { version: "desc" },
    });

    pendientes.push({
      periodo: intento.weeklyPeriod,
      intentoAbandonado: intento,
      cierreExistenteId: cierreExistente?.id,
    });
  }

  return pendientes;
}

/**
 * Devuelve todos los ClosureAttempt de un período, ordenados cronológicamente.
 */
export async function listarIntentos(
  weeklyPeriodId: string
): Promise<ClosureAttempt[]> {
  return db.closureAttempt.findMany({
    where: { weeklyPeriodId },
    orderBy: { intentoNum: "asc" },
  });
}
