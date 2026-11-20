/**
 * Módulo Historial — Servicio de Consolidación Diaria (WeeklyConsolidadoDia)
 *
 * Responsabilidades:
 *  - consolidarPeriodo: genera los registros WeeklyConsolidadoDia para una
 *    versión concreta de cierre (weeklyClosureId).
 *  - recuperarConsolidacion: alias semántico para reintentos de recuperación.
 *
 * ─── Diseño de idempotencia ───────────────────────────────────────────────
 *
 *  createMany({ skipDuplicates: true }) garantiza que un reintento sobre la
 *  misma (weeklyClosureId, userId, fechaLaboral) no produce duplicados ni errores.
 *  La restricción única @@unique([weeklyClosureId, userId, fechaLaboral]) es
 *  la barrera definitiva en BD.
 *
 * ─── Independencia de versiones ─────────────────────────────────────────
 *
 *  Cada WeeklyClosure tiene su propio id. Los consolidados de v1 y v2 de un
 *  mismo período coexisten sin colisión porque weeklyClosureId es diferente.
 *  Esta función nunca modifica filas de versiones anteriores.
 *
 * ─── Timestamp de marcaciones ─────────────────────────────────────────────
 *
 *  Si el Attendance tiene currentVersion (AttendanceVersion con timestampUTC),
 *  se usa ese valor preciso. En caso contrario se usa Attendance.createdAt,
 *  que en el flujo actual del kiosk es equivalente al momento real de la marca.
 *
 * ─── Universo de empleados ───────────────────────────────────────────────
 *
 *  Se incluyen todos los empleados (activos e inactivos) que tuvieron una
 *  EmployeeScheduleAssignment vigente durante al menos un día del período.
 *  Esto garantiza que ausencias de empleados desactivados queden registradas.
 *
 * ─── Incidencias ─────────────────────────────────────────────────────────
 *
 *  Se cuenta un snapshot de incidencias en el momento del cierre.
 *  El conteo NO se actualiza retroactivamente si una incidencia cambia de
 *  estado después del cierre (eso queda en versiones futuras).
 */

import { Prisma, TipoMarcacion, EstadoIncidencia } from "@prisma/client";
import { db } from "@/lib/db";
import { evaluarPuntualidad } from "@/lib/attendance-utils";
import { evaluarRango } from "@/lib/calendario.service";

// ---------------------------------------------------------------------------
// Constantes internas
// ---------------------------------------------------------------------------

const ESTADOS_PENDIENTES: EstadoIncidencia[] = [
  "PENDIENTE",
  "EN_REVISION",
];

const ESTADOS_RESUELTAS: EstadoIncidencia[] = [
  "JUSTIFICADA",
  "RESUELTA",
  "RECHAZADA",
];

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export interface ConsolidarPeriodoResult {
  /** Número de filas WeeklyConsolidadoDia insertadas (0 en reintentos idempotentes). */
  rowsCreated: number;
  /** Número total de empleados procesados. */
  empleadosProcesados: number;
  /** Número de días por empleado (siempre 7). */
  diasPorEmpleado: number;
}

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

/** Genera los 7 días del período (lunes a domingo) como Date UTC midnight. */
function generarDiasSemana(inicioSemana: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) =>
    new Date(
      Date.UTC(
        inicioSemana.getUTCFullYear(),
        inicioSemana.getUTCMonth(),
        inicioSemana.getUTCDate() + i
      )
    )
  );
}

// ---------------------------------------------------------------------------
// Operación principal
// ---------------------------------------------------------------------------

/**
 * Construye (sin insertar) las filas WeeklyConsolidadoDia de una versión de
 * cierre. Solo lectura. La evaluación de cada día (festivo, novedad
 * autorizada, horario y tolerancias) se delega en calendario.service.
 */
export async function construirFilasConsolidado(
  weeklyClosureId: string,
  weeklyPeriodId: string
): Promise<{ rows: Prisma.WeeklyConsolidadoDiaCreateManyInput[]; userIds: string[] }> {
  // ── 1. Leer el período ────────────────────────────────────────────────────
  const period = await db.weeklyPeriod.findUniqueOrThrow({
    where: { id: weeklyPeriodId },
    select: { inicioSemana: true, finSemana: true },
  });

  const dias = generarDiasSemana(period.inicioSemana);

  // ── 2. Empleados con asignación vigente durante el período ────────────────
  //    Incluye inactivos si tuvieron asignación histórica en esta semana.
  const assignments = await db.employeeScheduleAssignment.findMany({
    where: {
      validFrom: { lte: period.finSemana },
      OR: [
        { validUntil: null },
        { validUntil: { gte: period.inicioSemana } },
      ],
    },
    select: { userId: true },
  });

  // userIds únicos preservando orden de aparición
  const userIds = [...new Set(assignments.map((a) => a.userId))];

  if (userIds.length === 0) {
    return { rows: [], userIds };
  }

  // Calendario del período: 3 consultas agrupadas (asignaciones, festivos
  // activos y novedades autorizadas), sin consultas por empleado o día.
  const calendario = await evaluarRango(userIds, period.inicioSemana, period.finSemana);

  // ── 3. Batch fetch: marcaciones del período ───────────────────────────────
  const allAttendances = await db.attendance.findMany({
    where: {
      userId: { in: userIds },
      fechaLaboral: {
        gte: period.inicioSemana,
        lte: period.finSemana,
      },
    },
    include: {
      currentVersion: true, // AttendanceVersion | null
    },
  });

  // ── 4. Batch fetch: incidencias del período ───────────────────────────────
  const allIncidents = await db.attendanceIncident.findMany({
    where: {
      userId: { in: userIds },
      fechaLaboral: {
        gte: period.inicioSemana,
        lte: period.finSemana,
      },
    },
    select: { userId: true, fechaLaboral: true, estado: true },
  });

  // ── 5. Construir filas ────────────────────────────────────────────────────
  const rows: Prisma.WeeklyConsolidadoDiaCreateManyInput[] = [];

  for (const userId of userIds) {
    for (const fecha of dias) {
      // Evaluación del día: festivo > novedad autorizada > horario
      const ev = calendario.evaluar(userId, fecha);
      const assignment = ev.asignacion;
      const dayRule = ev.dayRule;
      const esLaboral = ev.esLaborable;

      // Tolerancias: personalizada del empleado > política
      const toleranciaEntrada = ev.toleranciaEntradaMin;
      const toleranciaAlmuerzo = ev.toleranciaAlmuerzoMin;

      // Marcaciones de este (usuario, día)
      const userDayAtts = allAttendances.filter(
        (a) =>
          a.userId === userId &&
          a.fechaLaboral.getTime() === fecha.getTime()
      );

      const findAtt = (tipo: TipoMarcacion) =>
        userDayAtts.find((a) => a.tipo === tipo) ?? null;

      const attEM = findAtt("ENTRADA_MANANA");
      const attSA = findAtt("SALIDA_ALMUERZO");
      const attEA = findAtt("ENTRADA_ALMUERZO");
      const attSJ = findAtt("SALIDA_JORNADA");

      // Timestamps: versión actual si existe, si no createdAt del Attendance
      const tsEM = attEM
        ? (attEM.currentVersion?.timestampUTC ?? attEM.createdAt)
        : null;
      const tsEA = attEA
        ? (attEA.currentVersion?.timestampUTC ?? attEA.createdAt)
        : null;

      // Tardanzas (solo si hay dayRule; sin horario no se inventan valores)
      let tardanzaEntradaMin = 0;
      let tardanzaAlmuerzoMin = 0;

      if (esLaboral && dayRule) {
        if (tsEM) {
          const ev = evaluarPuntualidad(
            tsEM,
            dayRule.horaEntradaManana,
            toleranciaEntrada,
            true
          );
          tardanzaEntradaMin = Math.max(0, ev.minutosRetraso);
        }
        if (tsEA) {
          const ev = evaluarPuntualidad(
            tsEA,
            dayRule.horaEntradaAlmuerzo,
            toleranciaAlmuerzo,
            true
          );
          tardanzaAlmuerzoMin = Math.max(0, ev.minutosRetraso);
        }
      }

      // Incidencias de este (usuario, día) — snapshot en momento de cierre
      const userDayIncidents = allIncidents.filter(
        (i) =>
          i.userId === userId &&
          i.fechaLaboral.getTime() === fecha.getTime()
      );

      const incidenciasPendientes = userDayIncidents.filter((i) =>
        ESTADOS_PENDIENTES.includes(i.estado)
      ).length;

      const incidenciasResueltas = userDayIncidents.filter((i) =>
        ESTADOS_RESUELTAS.includes(i.estado)
      ).length;

      // Flags derivados
      const tieneEntradaManana = Boolean(attEM);
      const tieneSalidaAlmuerzo = Boolean(attSA);
      const tieneEntradaAlmuerzo = Boolean(attEA);
      const tieneSalidaJornada = Boolean(attSJ);

      const jornadaCompleta =
        tieneEntradaManana &&
        tieneSalidaAlmuerzo &&
        tieneEntradaAlmuerzo &&
        tieneSalidaJornada;

      // Ausente: solo si se esperaban marcaciones (laborable y sin novedad
      // autorizada) y no hay ninguna marca
      const ausente =
        ev.seEsperanMarcaciones &&
        !tieneEntradaManana &&
        !tieneSalidaAlmuerzo &&
        !tieneEntradaAlmuerzo &&
        !tieneSalidaJornada;

      const esImpuntual = tardanzaEntradaMin > 0 || tardanzaAlmuerzoMin > 0;

      rows.push({
        weeklyClosureId,
        userId,
        fechaLaboral: fecha,
        esLaboral,
        tieneEntradaManana,
        tieneSalidaAlmuerzo,
        tieneEntradaAlmuerzo,
        tieneSalidaJornada,
        jornadaCompleta,
        ausente,
        tardanzaEntradaMin,
        tardanzaAlmuerzoMin,
        esImpuntual,
        incidenciasPendientes,
        incidenciasResueltas,
        toleranciaEntradaMin: toleranciaEntrada,
        toleranciaAlmuerzoMin: toleranciaAlmuerzo,
        schedulePolicyId: assignment?.schedulePolicyId ?? null,
        esNoLaborableCalendario: ev.esNoLaborableCalendario,
        novedadId: ev.novedad?.id ?? null,
      });
    }
  }

  return { rows, userIds };
}

/**
 * Genera los registros WeeklyConsolidadoDia para una versión concreta de cierre.
 *
 * Esta función es idempotente: puede llamarse varias veces con el mismo
 * weeklyClosureId sin duplicar datos ni lanzar errores de unicidad.
 *
 * @param weeklyClosureId - ID del WeeklyClosure ya comprometido en BD.
 * @param weeklyPeriodId  - ID del WeeklyPeriod correspondiente.
 */
export async function consolidarPeriodo(
  weeklyClosureId: string,
  weeklyPeriodId: string
): Promise<ConsolidarPeriodoResult> {
  const { rows, userIds } = await construirFilasConsolidado(weeklyClosureId, weeklyPeriodId);

  if (userIds.length === 0) {
    return { rowsCreated: 0, empleadosProcesados: 0, diasPorEmpleado: 7 };
  }

  // ── Insertar (idempotente: skipDuplicates evita errores en reintentos) ────
  const result = await db.weeklyConsolidadoDia.createMany({
    data: rows,
    skipDuplicates: true,
  });

  return {
    rowsCreated: result.count,
    empleadosProcesados: userIds.length,
    diasPorEmpleado: 7,
  };
}

/**
 * Reintenta la consolidación de un cierre existente cuyo proceso previo falló.
 *
 * Idéntico a consolidarPeriodo semánticamente diferenciado para recuperación.
 * Puede llamarse directamente cuando el ClosureAttempt tiene errorMsg
 * "CONSOLIDACION_FALLIDA" sin necesidad de crear un nuevo intento de cierre.
 */
export async function recuperarConsolidacion(
  weeklyClosureId: string,
  weeklyPeriodId: string
): Promise<ConsolidarPeriodoResult> {
  return consolidarPeriodo(weeklyClosureId, weeklyPeriodId);
}
