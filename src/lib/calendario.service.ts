// src/lib/calendario.service.ts
/**
 * F5a — Servicio compartido de calendario laboral.
 *
 * Única fuente de verdad para determinar qué se espera de un empleado en una
 * fecha. Prioridad de evaluación:
 *   1. Festivo activo de la empresa (DiaNoLaborable.isActive)  → no laborable.
 *   2. Novedad AUTORIZADA del empleado que cubra la fecha        → no se esperan marcas.
 *   3. Asignación de horario vigente y regla del día             → laborable o no.
 *
 * Las novedades PENDIENTE y RECHAZADA nunca se consideran.
 * Este servicio no impide registrar marcaciones: solo interpreta el día.
 *
 * Fechas: se trabaja con fechas laborales `@db.Date` (medianoche UTC), igual
 * que Attendance.fechaLaboral y WeeklyConsolidadoDia.fechaLaboral.
 */
import type {
  DiaSemana,
  EmployeeScheduleAssignment,
  ScheduleDayRule,
  SchedulePolicy,
  TipoNovedad,
} from "@prisma/client";
import { db } from "@/lib/db";

const UTC_DAY_TO_DIA: DiaSemana[] = [
  "DOMINGO",
  "LUNES",
  "MARTES",
  "MIERCOLES",
  "JUEVES",
  "VIERNES",
  "SABADO",
] as DiaSemana[];

export type AsignacionConPolitica = EmployeeScheduleAssignment & {
  policy: SchedulePolicy & { dayRules: ScheduleDayRule[] };
};

export interface EvaluacionDia {
  userId: string;
  fecha: Date;
  /** false si hay festivo activo o la regla del horario no es laboral (o no hay horario). */
  esLaborable: boolean;
  /** true si la fecha es un festivo activo de la empresa. */
  esNoLaborableCalendario: boolean;
  /** Novedad AUTORIZADA que cubre la fecha, o null. */
  novedad: { id: string; tipo: TipoNovedad } | null;
  /** Asignación vigente (la de validFrom más reciente que cubre la fecha). */
  asignacion: AsignacionConPolitica | null;
  /** Regla laboral del día en la política asignada (null si el día no es laboral en el horario). */
  dayRule: ScheduleDayRule | null;
  /** true solo si el día es laborable y no hay novedad autorizada. */
  seEsperanMarcaciones: boolean;
  /** Tolerancia de entrada: personalizada del empleado > política > 0. */
  toleranciaEntradaMin: number;
  /** Tolerancia de regreso de almuerzo: política > 0. */
  toleranciaAlmuerzoMin: number;
}

/** Datos ya cargados sobre los que se evalúa (permite evaluar sin consultas extra). */
export interface DatosCalendario {
  asignaciones: AsignacionConPolitica[];
  festivos: { fecha: Date }[];
  novedades: { id: string; userId: string; tipo: TipoNovedad; fechaInicio: Date; fechaFin: Date; createdAt: Date }[];
}

export interface CalendarioRango {
  evaluar(userId: string, fecha: Date): EvaluacionDia;
}

/** Normaliza a medianoche UTC (fecha laboral). */
export function aFechaLaboral(fecha: Date): Date {
  return new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate()));
}

/**
 * Evaluación pura a partir de datos ya cargados. No consulta la base de datos.
 */
export function evaluarConDatos(datos: DatosCalendario, userId: string, fechaEntrada: Date): EvaluacionDia {
  const fecha = aFechaLaboral(fechaEntrada);
  const t = fecha.getTime();

  // 3. Asignación vigente: la de validFrom más reciente que cubre el día
  const asignacion =
    datos.asignaciones
      .filter(
        (a) =>
          a.userId === userId &&
          a.validFrom.getTime() <= t &&
          (a.validUntil === null || a.validUntil.getTime() >= t)
      )
      .sort((a, b) => b.validFrom.getTime() - a.validFrom.getTime())[0] ?? null;

  const diaEnum = UTC_DAY_TO_DIA[fecha.getUTCDay()];
  const dayRule =
    asignacion?.policy.dayRules.find((r) => r.dia === diaEnum && r.esLaboral) ?? null;

  // 1. Festivo activo
  const esNoLaborableCalendario = datos.festivos.some(
    (f) => aFechaLaboral(f.fecha).getTime() === t
  );

  // 2. Novedad autorizada (si hubiera varias, la más antigua, de forma determinista)
  const nov =
    datos.novedades
      .filter(
        (n) =>
          n.userId === userId &&
          aFechaLaboral(n.fechaInicio).getTime() <= t &&
          aFechaLaboral(n.fechaFin).getTime() >= t
      )
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0] ?? null;

  const esLaborable = !esNoLaborableCalendario && Boolean(dayRule);

  return {
    userId,
    fecha,
    esLaborable,
    esNoLaborableCalendario,
    novedad: nov ? { id: nov.id, tipo: nov.tipo } : null,
    asignacion,
    dayRule,
    seEsperanMarcaciones: esLaborable && !nov,
    toleranciaEntradaMin:
      asignacion?.toleranciaPersonalizadaMin ?? asignacion?.policy.toleranciaEntradaMinutos ?? 0,
    toleranciaAlmuerzoMin: asignacion?.policy.toleranciaAlmuerzoMinutos ?? 0,
  };
}

/**
 * Carga en 3 consultas agrupadas (asignaciones, festivos activos y novedades
 * AUTORIZADAS) todo lo necesario para evaluar a varios empleados en un rango
 * de fechas, y devuelve un evaluador sin consultas adicionales (evita N+1).
 */
export async function evaluarRango(
  userIds: string[],
  desde: Date,
  hasta: Date
): Promise<CalendarioRango> {
  const ids = [...new Set(userIds)];
  const ini = aFechaLaboral(desde);
  const fin = aFechaLaboral(hasta);

  if (ids.length === 0) {
    const vacio: DatosCalendario = { asignaciones: [], festivos: [], novedades: [] };
    return { evaluar: (u, f) => evaluarConDatos(vacio, u, f) };
  }

  const [asignaciones, festivos, novedades] = await Promise.all([
    db.employeeScheduleAssignment.findMany({
      where: {
        userId: { in: ids },
        validFrom: { lte: fin },
        OR: [{ validUntil: null }, { validUntil: { gte: ini } }],
      },
      include: { policy: { include: { dayRules: true } } },
    }),
    db.diaNoLaborable.findMany({
      where: { isActive: true, fecha: { gte: ini, lte: fin } },
      select: { fecha: true },
    }),
    db.novedadEmpleado.findMany({
      where: {
        userId: { in: ids },
        estado: "AUTORIZADA",
        fechaInicio: { lte: fin },
        fechaFin: { gte: ini },
      },
      select: { id: true, userId: true, tipo: true, fechaInicio: true, fechaFin: true, createdAt: true },
    }),
  ]);

  const datos: DatosCalendario = { asignaciones, festivos, novedades };
  return { evaluar: (userId, fecha) => evaluarConDatos(datos, userId, fecha) };
}

/** Evalúa un único empleado en una fecha. */
export async function evaluarDia(userId: string, fecha: Date): Promise<EvaluacionDia> {
  const cal = await evaluarRango([userId], fecha, fecha);
  return cal.evaluar(userId, fecha);
}
