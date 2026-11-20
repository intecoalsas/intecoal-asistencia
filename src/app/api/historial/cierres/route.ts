// src/app/api/historial/cierres/route.ts
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  listarCierres,
  listarIntentos,
  UMBRAL_ABANDONO_MS,
} from "@/modules/historial";

const LIMITE_DEFECTO = 12;
const LIMITE_MAX = 52;

/**
 * GET /api/historial/cierres?limite=12
 *
 * Consulta administrativa (solo lectura) de períodos semanales: estado,
 * versiones de cierre exitosas e intentos de cierre, con indicadores de
 * revisión requerida.
 *
 * Query params:
 *   limite (opcional) 1–52, número de semanas más recientes. Defecto 12.
 *
 * Permisos: ADMIN, SUPERVISOR.
 */
export const GET = requireAuth(async (req) => {
  const limiteStr = new URL(req.url).searchParams.get("limite");
  const limite = limiteStr ? parseInt(limiteStr, 10) : LIMITE_DEFECTO;

  if (isNaN(limite) || limite < 1 || limite > LIMITE_MAX) {
    return NextResponse.json(
      { error: `El límite debe ser un número entero entre 1 y ${LIMITE_MAX}` },
      { status: 400 }
    );
  }

  // Listado de períodos: no existe servicio de listado, consulta de solo lectura.
  const periodos = await db.weeklyPeriod.findMany({
    orderBy: { inicioSemana: "desc" },
    take: limite,
  });

  const umbralFecha = Date.now() - UMBRAL_ABANDONO_MS;

  // Conteo de filas consolidadas por cierre (una sola consulta agregada).
  // Un cierre exitoso con 0 filas = consolidación pendiente (mismo criterio que el cron).
  const conteos = await db.weeklyConsolidadoDia.groupBy({
    by: ["weeklyClosureId"],
    where: { weeklyClosure: { weeklyPeriodId: { in: periodos.map((p) => p.id) } } },
    _count: { _all: true },
  });
  const filasPorCierre = new Map(conteos.map((c) => [c.weeklyClosureId, c._count._all]));

  const data = await Promise.all(
    periodos.map(async (p) => {
      const [cierres, intentos] = await Promise.all([
        listarCierres(p.id),
        listarIntentos(p.id),
      ]);

      const vigente = cierres.length ? cierres[cierres.length - 1] : null;

      // Cero filas no implica fallo: consolidarPeriodo devuelve 0 filas de forma
      // legítima solo si no hay asignaciones de horario que cubran la semana
      // (en otro caso genera 7 filas por empleado). Se considera pendiente si:
      //  a) existe un registro explícito CONSOLIDACION_FALLIDA para ese cierre, o
      //  b) hay asignaciones que cubren la semana (se esperaban filas > 0).
      let consolidacionPendiente = false;
      if (vigente !== null && (filasPorCierre.get(vigente.id) ?? 0) === 0) {
        const falloRegistrado = intentos.some((i) =>
          i.errorMsg?.includes(`CONSOLIDACION_FALLIDA (cierreId=${vigente.id})`)
        );
        consolidacionPendiente =
          falloRegistrado ||
          (await db.employeeScheduleAssignment.count({
            where: {
              validFrom: { lte: p.finSemana },
              OR: [{ validUntil: null }, { validUntil: { gte: p.inicioSemana } }],
            },
          })) > 0;
      }

      const intentosConRevision = intentos.map((i) => {
        const abandonado =
          i.resultado === "EN_PROGRESO" && i.iniciado.getTime() < umbralFecha;
        // CONSOLIDACION_FALLIDA solo sigue requiriendo revisión si ese cierre aún no tiene filas.
        const cierreFallido = i.errorMsg?.match(/CONSOLIDACION_FALLIDA \(cierreId=([^)]+)\)/)?.[1];
        const consolidacionFallidaVigente =
          cierreFallido !== undefined && (filasPorCierre.get(cierreFallido) ?? 0) === 0;
        const revisionRequerida =
          abandonado ||
          consolidacionFallidaVigente ||
          (i.errorMsg?.includes("REVISION_REQUERIDA") ?? false);
        return {
          id: i.id,
          intentoNum: i.intentoNum,
          resultado: i.resultado,
          errorMsg: i.errorMsg,
          iniciado: i.iniciado,
          finalizado: i.finalizado,
          abandonado,
          revisionRequerida,
        };
      });

      const motivosRevision: string[] = [];
      if (intentosConRevision.some((i) => i.abandonado))
        motivosRevision.push("Intento de cierre abandonado");
      if (
        intentosConRevision.some(
          (i) => i.revisionRequerida && !i.abandonado && i.errorMsg?.includes("REVISION_REQUERIDA")
        )
      )
        motivosRevision.push("Intento marcado REVISION_REQUERIDA");
      if (consolidacionPendiente)
        motivosRevision.push(`Consolidación pendiente de la versión vigente v${vigente!.version}`);
      if (p.estado === "PENDIENTE_CIERRE")
        motivosRevision.push("Período pendiente de cierre");
      if ((p.estado === "CERRADA") && cierres.length === 0)
        motivosRevision.push("Período cerrado sin cierre exitoso");

      return {
        id: p.id,
        inicioSemana: p.inicioSemana,
        finSemana: p.finSemana,
        estado: p.estado,
        versionVigente: vigente?.version ?? null,
        consolidacionPendiente,
        cierres: cierres.map((c) => ({
          filasConsolidadas: filasPorCierre.get(c.id) ?? 0,
          id: c.id,
          version: c.version,
          tipo: c.tipo,
          cerradoEn: c.cerradoEn,
          motivo: c.motivo,
          conActor: c.actorId !== null,
        })),
        intentos: intentosConRevision,
        revisionRequerida: motivosRevision.length > 0,
        motivosRevision,
      };
    })
  );

  return NextResponse.json({ data });
}, ["ADMIN", "SUPERVISOR"]);
