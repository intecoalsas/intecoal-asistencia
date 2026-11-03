import { formatInTimeZone, toZonedTime, fromZonedTime } from "date-fns-tz";
import { format as formatNative } from "date-fns";

export const APP_TIMEZONE = process.env.APP_TIMEZONE || "America/Bogota";

/**
 * Obtiene la fecha y hora actual en la zona horaria del sistema (America/Bogota).
 */
export function getNowInBogota(): Date {
  return toZonedTime(new Date(), APP_TIMEZONE);
}

/**
 * Convierte una fecha UTC a la zona horaria de Bogotá.
 */
export function toBogotaTime(date: Date | string | number): Date {
  return toZonedTime(new Date(date), APP_TIMEZONE);
}

/**
 * Formatea una fecha en la zona horaria de Bogotá.
 * @param date Fecha a formatear
 * @param pattern Patrón de fecha (por defecto: 'yyyy-MM-dd HH:mm:ss')
 */
export function formatBogota(
  date: Date | string | number,
  pattern: string = "yyyy-MM-dd HH:mm:ss"
): string {
  return formatInTimeZone(new Date(date), APP_TIMEZONE, pattern);
}

/**
 * Obtiene la representación 'YYYY-MM-DD' de la fecha actual en Bogotá.
 */
export function getTodayDateString(): string {
  return formatInTimeZone(new Date(), APP_TIMEZONE, "yyyy-MM-dd");
}
