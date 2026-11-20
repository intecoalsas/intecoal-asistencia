/**
 * Módulo Historial — Servicios de Consulta (Fase 6)
 *
 * Funciones de solo lectura para consultar el historial consolidado por semana,
 * mes, año y empleado individual.
 *
 * ─── Principio de versión vigente ───────────────────────────────────────────
 *
 *  La "versión vigente" de un período es el WeeklyClosure con el MAX(version)
 *  donde exitoso = true. Esto es consistente con lo establecido en las fases
 *  anteriores y garantiza que:
 *   - Múltiples versiones de cierre del mismo período no se duplican.
 *   - Si el período fue reabierto sin nuevo cierre, se usa el último cierre
 *     exitoso (el histórico más reciente).
 *   - Períodos sin ningún cierre exitoso se omiten de los resultados.
 *
 * ─── Distribución por mes (semanas que cruzan de mes) ────────────────────────
 *
 *  Los consolidados se agrupan por el mes UTC de `fechaLaboral`. Una semana
 *  lunes-domingo que cruza meses (ej. 2027-10-25 al 2027-10-31/2027-11-01..06)
 *  distribuye cada fila en el mes al que pertenece su `fechaLaboral`.
 *  Esto evita asignar días de noviembre a octubre o viceversa.
 *
 * ─── Empleados inactivos ─────────────────────────────────────────────────────
 *
 *  El consolidado fue generado en el momento del cierre (snapshot). Los datos
 *  de empleados inactivos están preservados en WeeklyConsolidadoDia y se
 *  incluyen en todos los resultados sin filtro por isActive.
 *
 * ─── Sin inventar resultados ─────────────────────────────────────────────────
 *
 *  Si una semana/mes/año no tiene ningún cierre exitoso consolidado, las
 *  funciones devuelven estructuras vacías o arrays vacíos, nunca datos ficticios.
 */

import { WeeklyConsolidadoDia } from "@prisma/client";
import { db } from "@/lib/db";

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

/** Resumen de un día individual de un empleado. */
export interface DiaConsolidado {
  fechaLaboral: Date;
  userId: string;
  esLaboral: boolean;
  tieneEntradaManana: boolean;
  tieneSalidaAlmuerzo: boolean;
  tieneEntradaAlmuerzo: boolean;
  tieneSalidaJornada: boolean;
  jornadaCompleta: boolean;
  ausente: boolean;
  tardanzaEntradaMin: number;
  tardanzaAlmuerzoMin: number;
  esImpuntual: boolean;
  incidenciasPendientes: number;
  incidenciasResueltas: number;
  schedulePolicyId: string | null;
}

/** Métricas agregadas para un conjunto de filas consolidadas. */
export interface MetricasConsolidado {
  /** Total de empleados distintos con al menos un día registrado. */
  totalEmpleados: number;
  /** Suma de días marcados como laborales (esLaboral = true). */
  diasLaborales: number;
  /** Días laborales con al menos ENTRADA_MANANA registrada. */
  asistencias: number;
  /** Días laborales sin ninguna marca (ausente = true). */
  ausencias: number;
  /** Días con las 4 marcas completas. */
  jornadasCompletas: number;
  /** Días laborales con asistencia pero sin jornada completa. */
  jornadasIncompletas: number;
  /** Días con esImpuntual = true. */
  tardanzas: number;
  /** Suma total de tardanzaEntradaMin. */
  minutosTardanzaEntrada: number;
  /** Suma total de tardanzaAlmuerzoMin. */
  minutosTardanzaAlmuerzo: number;
  /** Suma total de incidenciasPendientes. */
  incidenciasPendientes: number;
  /** Suma total de incidenciasResueltas. */
  incidenciasResueltas: number;
}

/** Resultado de consulta semanal. */
export interface ResumenSemanal {
  weeklyPeriodId: string;
  weeklyClosureId: string;
  version: number;
  inicioSemana: Date;
  finSemana: Date;
  metricas: MetricasConsolidado;
  /** Filas individuales por empleado/día (opcional, solo cuando se pide detalle). */
  detalle?: DiaConsolidado[];
}

/** Resultado de consulta mensual. */
export interface ResumenMensual {
  anio: number;
  mes: number; // 1–12
  metricas: MetricasConsolidado;
  /** Resúmenes semanales incluidos en este mes (semanas con algún día en este mes). */
  semanas: Omit<ResumenSemanal, "detalle">[];
}

/** Resultado de consulta anual: array de 12 meses (vacíos si no hay datos). */
export type ResumenAnual = {
  anio: number;
  meses: ResumenMensual[];
};

/** Resultado de consulta individual por empleado. */
export interface ResumenEmpleado {
  userId: string;
  /** Semanas con datos para este empleado. */
  semanas: {
    weeklyPeriodId: string;
    weeklyClosureId: string;
    version: number;
    inicioSemana: Date;
    finSemana: Date;
    metricas: MetricasConsolidado;
    dias: DiaConsolidado[];
  }[];
  metricasGlobales: MetricasConsolidado;
}

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

/** Convierte una fila de BD al tipo DiaConsolidado. */
function toDay(row: WeeklyConsolidadoDia): DiaConsolidado {
  return {
    fechaLaboral:        row.fechaLaboral,
    userId:              row.userId,
    esLaboral:           row.esLaboral,
    tieneEntradaManana:  row.tieneEntradaManana,
    tieneSalidaAlmuerzo: row.tieneSalidaAlmuerzo,
    tieneEntradaAlmuerzo:row.tieneEntradaAlmuerzo,
    tieneSalidaJornada:  row.tieneSalidaJornada,
    jornadaCompleta:     row.jornadaCompleta,
    ausente:             row.ausente,
    tardanzaEntradaMin:  row.tardanzaEntradaMin,
    tardanzaAlmuerzoMin: row.tardanzaAlmuerzoMin,
    esImpuntual:         row.esImpuntual,
    incidenciasPendientes: row.incidenciasPendientes,
    incidenciasResueltas:  row.incidenciasResueltas,
    schedulePolicyId:    row.schedulePolicyId,
  };
}

/** Agrega un array de DiaConsolidado en MetricasConsolidado. */
function agregarMetricas(dias: DiaConsolidado[]): MetricasConsolidado {
  const userIds = new Set(dias.map(d => d.userId));
  let diasLaborales = 0, asistencias = 0, ausencias = 0;
  let jornadasCompletas = 0, jornadasIncompletas = 0, tardanzas = 0;
  let minutosTardanzaEntrada = 0, minutosTardanzaAlmuerzo = 0;
  let incidenciasPendientes = 0, incidenciasResueltas = 0;

  for (const d of dias) {
    if (d.esLaboral) {
      diasLaborales++;
      if (d.tieneEntradaManana) asistencias++;
      if (d.ausente) ausencias++;
      if (d.jornadaCompleta) jornadasCompletas++;
      else if (d.tieneEntradaManana) jornadasIncompletas++;
    }
    if (d.esImpuntual) tardanzas++;
    minutosTardanzaEntrada  += d.tardanzaEntradaMin;
    minutosTardanzaAlmuerzo += d.tardanzaAlmuerzoMin;
    incidenciasPendientes   += d.incidenciasPendientes;
    incidenciasResueltas    += d.incidenciasResueltas;
  }

  return {
    totalEmpleados:          userIds.size,
    diasLaborales,
    asistencias,
    ausencias,
    jornadasCompletas,
    jornadasIncompletas,
    tardanzas,
    minutosTardanzaEntrada,
    minutosTardanzaAlmuerzo,
    incidenciasPendientes,
    incidenciasResueltas,
  };
}

/**
 * Obtiene el WeeklyClosure vigente (MAX version exitoso) para un período.
 * Devuelve null si no existe ningún cierre exitoso consolidado.
 */
async function obtenerCierreVigenteParaConsulta(weeklyPeriodId: string) {
  return db.weeklyClosure.findFirst({
    where: { weeklyPeriodId, exitoso: true },
    orderBy: { version: "desc" },
    include: {
      weeklyPeriod: { select: { inicioSemana: true, finSemana: true } },
      consolidados: true,
    },
  });
}

// ---------------------------------------------------------------------------
// Consulta semanal
// ---------------------------------------------------------------------------

/**
 * Devuelve el resumen de una semana identificada por su weeklyPeriodId.
 * Usa la versión de cierre vigente (MAX version exitoso).
 *
 * @param incluirDetalle - Si true, adjunta el array de filas individuales.
 */
export async function consultarSemana(
  weeklyPeriodId: string,
  incluirDetalle = false
): Promise<ResumenSemanal | null> {
  const cierre = await obtenerCierreVigenteParaConsulta(weeklyPeriodId);
  if (!cierre || cierre.consolidados.length === 0) return null;

  const dias = cierre.consolidados.map(toDay);
  return {
    weeklyPeriodId,
    weeklyClosureId: cierre.id,
    version: cierre.version,
    inicioSemana: cierre.weeklyPeriod.inicioSemana,
    finSemana:    cierre.weeklyPeriod.finSemana,
    metricas:     agregarMetricas(dias),
    ...(incluirDetalle ? { detalle: dias } : {}),
  };
}

// ---------------------------------------------------------------------------
// Consulta mensual
// ---------------------------------------------------------------------------

/**
 * Devuelve el resumen de un mes calendario (año + mes 1-12).
 *
 * Busca todos los períodos semanales que tengan al menos un día con
 * fechaLaboral en ese mes, usa la versión vigente de cada uno y agrupa
 * los días de ese mes solamente (distribución correcta en semanas cruzadas).
 */
export async function consultarMes(
  anio: number,
  mes: number // 1–12
): Promise<ResumenMensual> {
  // Rango del mes en fechas UTC midnight
  const inicioMes = new Date(Date.UTC(anio, mes - 1, 1));
  const finMes    = new Date(Date.UTC(anio, mes, 0)); // último día del mes

  // Períodos que tienen días en este mes
  const periodos = await db.weeklyPeriod.findMany({
    where: {
      inicioSemana: { lte: finMes },
      finSemana:    { gte: inicioMes },
    },
    orderBy: { inicioSemana: "asc" },
  });

  const semanas: Omit<ResumenSemanal, "detalle">[] = [];
  const diasDelMes: DiaConsolidado[] = [];

  for (const p of periodos) {
    const cierre = await obtenerCierreVigenteParaConsulta(p.id);
    if (!cierre || cierre.consolidados.length === 0) continue;

    // Solo días cuya fechaLaboral pertenece a este mes
    const diasSemanaEnMes = cierre.consolidados
      .filter(r => {
        const m = r.fechaLaboral.getUTCMonth() + 1;
        const y = r.fechaLaboral.getUTCFullYear();
        return y === anio && m === mes;
      })
      .map(toDay);

    if (diasSemanaEnMes.length === 0) continue;

    diasDelMes.push(...diasSemanaEnMes);

    const todosLosDias = cierre.consolidados.map(toDay);
    semanas.push({
      weeklyPeriodId: p.id,
      weeklyClosureId: cierre.id,
      version: cierre.version,
      inicioSemana: cierre.weeklyPeriod.inicioSemana,
      finSemana:    cierre.weeklyPeriod.finSemana,
      metricas: agregarMetricas(diasSemanaEnMes), // métricas solo de los días del mes
    });
    void todosLosDias; // referencia para evitar lint unused
  }

  return {
    anio,
    mes,
    metricas: agregarMetricas(diasDelMes),
    semanas,
  };
}

// ---------------------------------------------------------------------------
// Consulta anual
// ---------------------------------------------------------------------------

/**
 * Devuelve el resumen de un año calendario con los 12 meses.
 * Meses sin datos tienen métricas en cero y semanas vacías.
 */
export async function consultarAnio(anio: number): Promise<ResumenAnual> {
  const meses: ResumenMensual[] = [];
  for (let mes = 1; mes <= 12; mes++) {
    meses.push(await consultarMes(anio, mes));
  }
  return { anio, meses };
}

// ---------------------------------------------------------------------------
// Consulta individual por empleado
// ---------------------------------------------------------------------------

/**
 * Devuelve el historial consolidado de un empleado en un rango de semanas.
 *
 * @param userId        - ID del empleado.
 * @param inicioDesde   - Fecha de inicio mínima del período (inclusive, midnight UTC).
 * @param inicioHasta   - Fecha de inicio máxima del período (inclusive, midnight UTC).
 *                        Si se omite, no hay límite superior.
 */
export async function consultarEmpleado(
  userId: string,
  inicioDesde: Date,
  inicioHasta?: Date
): Promise<ResumenEmpleado> {
  // Períodos en el rango
  const periodos = await db.weeklyPeriod.findMany({
    where: {
      inicioSemana: {
        gte: inicioDesde,
        ...(inicioHasta ? { lte: inicioHasta } : {}),
      },
    },
    orderBy: { inicioSemana: "asc" },
  });

  const semanas: ResumenEmpleado["semanas"] = [];
  const todosDias: DiaConsolidado[] = [];

  for (const p of periodos) {
    const cierre = await db.weeklyClosure.findFirst({
      where: { weeklyPeriodId: p.id, exitoso: true },
      orderBy: { version: "desc" },
      include: {
        weeklyPeriod: { select: { inicioSemana: true, finSemana: true } },
        consolidados: {
          where: { userId },
          orderBy: { fechaLaboral: "asc" },
        },
      },
    });

    if (!cierre || cierre.consolidados.length === 0) continue;

    const dias = cierre.consolidados.map(toDay);
    todosDias.push(...dias);

    semanas.push({
      weeklyPeriodId:  p.id,
      weeklyClosureId: cierre.id,
      version:         cierre.version,
      inicioSemana:    cierre.weeklyPeriod.inicioSemana,
      finSemana:       cierre.weeklyPeriod.finSemana,
      metricas:        agregarMetricas(dias),
      dias,
    });
  }

  return {
    userId,
    semanas,
    metricasGlobales: agregarMetricas(todosDias),
  };
}

// ---------------------------------------------------------------------------
// Consulta rápida: semana por fecha
// ---------------------------------------------------------------------------

/**
 * Busca el período que contiene una fecha dada (como string "YYYY-MM-DD" UTC)
 * y devuelve su resumen. Atajo conveniente para consultas ad-hoc.
 */
export async function consultarSemanaParaFecha(
  fechaUTC: Date,
  incluirDetalle = false
): Promise<ResumenSemanal | null> {
  const periodo = await db.weeklyPeriod.findFirst({
    where: {
      inicioSemana: { lte: fechaUTC },
      finSemana:    { gte: fechaUTC },
    },
  });
  if (!periodo) return null;
  return consultarSemana(periodo.id, incluirDetalle);
}
