// src/app/historial/components/types.ts

export interface MetricasConsolidado {
  totalEmpleados: number;
  diasLaborales: number;
  asistencias: number;
  ausencias: number;
  jornadasCompletas: number;
  jornadasIncompletas: number;
  tardanzas: number;
  minutosTardanzaEntrada: number;
  minutosTardanzaAlmuerzo: number;
  incidenciasPendientes: number;
  incidenciasResueltas: number;
}

export interface DiaConsolidado {
  fechaLaboral: string;
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

export interface ResumenSemanal {
  weeklyPeriodId: string;
  weeklyClosureId: string;
  version: number;
  inicioSemana: string;
  finSemana: string;
  metricas: MetricasConsolidado;
  detalle?: DiaConsolidado[];
}

export interface ResumenMensual {
  anio: number;
  mes: number;
  metricas: MetricasConsolidado;
  semanas: Omit<ResumenSemanal, "detalle">[];
}

export interface ResumenAnual {
  anio: number;
  meses: ResumenMensual[];
}

export interface ResumenEmpleado {
  userId: string;
  semanas: {
    weeklyPeriodId: string;
    weeklyClosureId: string;
    version: number;
    inicioSemana: string;
    finSemana: string;
    metricas: MetricasConsolidado;
    dias: DiaConsolidado[];
  }[];
  metricasGlobales: MetricasConsolidado;
}
