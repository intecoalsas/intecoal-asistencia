/**
 * Utilidades compartidas para el cálculo de puntualidad de marcaciones.
 *
 * Esta función es la fuente canónica del cálculo de puntualidad del sistema.
 * Se reutiliza en:
 *   - src/app/api/marcaciones/route.ts  (presentación en tiempo real)
 *   - src/modules/historial/consolidado.service.ts (consolidados de cierre)
 */

import { formatBogota, timeStringToMinutes } from "@/lib/date-utils";

export type EstadoPuntualidad =
  | "Puntual"
  | "Tarde"
  | "Sin registro"
  | "Sin horario";

export interface EvaluacionPuntualidad {
  estado: EstadoPuntualidad;
  horaProgramada: string | null;
  minutosRetraso: number;
}

/**
 * Evalúa la puntualidad de una marcación respecto al horario programado.
 *
 * @param fechaMarcacion  - Timestamp UTC de la marcación (null si no existe).
 * @param horaProgramada  - Hora programada en formato "HH:mm" (null si no aplica).
 * @param toleranciaMinutos - Margen de gracia en minutos.
 * @param tieneHorario    - Indica si existe asignación de horario para ese día.
 * @returns Estado de puntualidad y minutos de retraso (0 si a tiempo).
 */
export function evaluarPuntualidad(
  fechaMarcacion: Date | null,
  horaProgramada: string | null,
  toleranciaMinutos: number,
  tieneHorario: boolean
): EvaluacionPuntualidad {
  if (!tieneHorario || !horaProgramada) {
    return { estado: "Sin horario", horaProgramada, minutosRetraso: 0 };
  }

  if (!fechaMarcacion) {
    return { estado: "Sin registro", horaProgramada, minutosRetraso: 0 };
  }

  const horaReal = formatBogota(fechaMarcacion, "HH:mm");
  const minutosReales = timeStringToMinutes(horaReal);
  const minutosProgramados = timeStringToMinutes(horaProgramada);
  const minutosRetraso = minutosReales - minutosProgramados - toleranciaMinutos;

  if (minutosRetraso > 0) {
    return { estado: "Tarde", horaProgramada, minutosRetraso };
  }

  return { estado: "Puntual", horaProgramada, minutosRetraso: 0 };
}
