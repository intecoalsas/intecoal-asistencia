/**
 * Roles del sistema INTECOAL Asistencia
 */
export type Role = "ADMIN" | "SUPERVISOR" | "EMPLEADO" | "KIOSCO";

/**
 * Los 4 tipos oficiales de marcación diaria
 */
export type TipoMarcacion =
  | "ENTRADA_MANANA"
  | "SALIDA_ALMUERZO"
  | "ENTRADA_ALMUERZO"
  | "SALIDA_JORNADA";

export const TIPOS_MARCACION_LABELS: Record<TipoMarcacion, string> = {
  ENTRADA_MANANA: "Entrada de la mañana",
  SALIDA_ALMUERZO: "Salida al almuerzo",
  ENTRADA_ALMUERZO: "Entrada del almuerzo",
  SALIDA_JORNADA: "Salida de la jornada",
};

/**
 * Estados de la marcación
 */
export type EstadoMarcacion = "ORIGINAL" | "CORREGIDO" | "JUSTIFICADO";

/**
 * Tipos de incidencias operativas de asistencia
 */
export type TipoIncidencia =
  | "MARCACION_FALTANTE"
  | "FUERA_DE_SECUENCIA"
  | "RETARDO_EXCESIVO"
  | "HORA_ATIPICA";

export type EstadoIncidencia =
  | "PENDIENTE"
  | "JUSTIFICADA"
  | "RESUELTA"
  | "RECHAZADA";

/**
 * Estructura de auditoría para correcciones manuales
 */
export interface AuditDiff {
  campo: string;
  valorAnterior: unknown;
  valorNuevo: unknown;
}
