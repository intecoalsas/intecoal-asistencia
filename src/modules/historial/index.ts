/**
 * Módulo Historial
 * Gestión de períodos semanales, cierres versionados y consolidados diarios.
 * Fase 1: esquema de BD.
 * Fase 2: servicio de períodos semanales.
 * Fase 3.1: servicio de cierres y reaperturas.
 * Fase 3.2: servicio de intentos y recuperación.
 */
export const HISTORIAL_MODULE_VERSION = "0.6.0";

export {
  calcularRangoSemana,
  getInicioSemana,
  getFinSemana,
  getOrCreateWeeklyPeriod,
  getCurrentWeeklyPeriod,
  findWeeklyPeriod,
  findWeeklyPeriodByInicio,
  getOrCreateWeeklyPeriodForDate,
} from "./weekly-period.service";

export {
  cerrarPeriodo,
  reabrirPeriodo,
  obtenerCierreVigente,
  listarCierres,
  esPeriodoCerrado,
  permiteModificaciones,
  HistorialError,
} from "./closure.service";

export type {
  CerrarPeriodoInput,
  ReabrirPeriodoInput,
  CerrarPeriodoResult,
  HistorialErrorCode,
} from "./closure.service";

export {
  ejecutarCierrePeriodo,
  reconciliarIntentoAbandonado,
  detectarPeriodosPendientes,
  listarIntentos,
  UMBRAL_ABANDONO_MS,
} from "./attempt.service";

export type {
  EjecutarCierreInput,
  EjecutarCierreResult,
  PeriodoPendiente,
  ReconciliacionResultado,
} from "./attempt.service";

export {
  consolidarPeriodo,
  recuperarConsolidacion,
} from "./consolidado.service";

export type { ConsolidarPeriodoResult } from "./consolidado.service";

export {
  registrarMarcacionTardia,
  listarPendientes,
  incorporarMarcacion,
  rechazarMarcacion,
  obtenerMarcacionTardia,
  listarMarcacionesTardiasPorPeriodo,
} from "./late-marcacion.service";

export type {
  RegistrarMarcacionTardiaInput,
  IncorporarMarcacionInput,
  RechazarMarcacionInput,
  ListarPendientesInput,
  IncorporarMarcacionResult,
} from "./late-marcacion.service";

export {
  consultarSemana,
  consultarMes,
  consultarAnio,
  consultarEmpleado,
  consultarSemanaParaFecha,
} from "./consulta.service";

export type {
  DiaConsolidado,
  MetricasConsolidado,
  ResumenSemanal,
  ResumenMensual,
  ResumenAnual,
  ResumenEmpleado,
} from "./consulta.service";
