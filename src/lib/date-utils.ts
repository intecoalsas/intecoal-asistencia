import { toZonedTime, formatInTimeZone } from "date-fns-tz";

export const APP_TIMEZONE =
  process.env.APP_TIMEZONE || "America/Bogota";

/**
 * Obtiene el instante actual en UTC.
 */
export const getNowUtc = (): Date => new Date();

/**
 * Obtiene los minutos actuales del día en Bogotá.
 */
export const getNowMinutesBogota = (): number => {
  const now = toZonedTime(new Date(), APP_TIMEZONE);
  return now.getHours() * 60 + now.getMinutes();
};

/**
 * Convierte una cadena HH:mm a minutos desde medianoche.
 */
export const timeStringToMinutes = (t: string): number => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

/**
 * Calcula la fecha laboral en Bogotá.
 *
 * IMPORTANTE:
 * Devuelve un Date normalizado a medianoche UTC.
 * Esto permite consultar correctamente campos MySQL DATE
 * mediante Prisma sin introducir un desplazamiento de 5 horas.
 */
export const getFechaLaboral = (date: Date): Date => {
  const dateString = formatInTimeZone(
    date,
    APP_TIMEZONE,
    "yyyy-MM-dd"
  );

  const [year, month, day] = dateString.split("-").map(Number);

  return new Date(Date.UTC(year, month - 1, day));
};

/**
 * Obtiene la fecha y hora actual en Bogotá.
 */
export function getNowInBogota(): Date {
  return toZonedTime(new Date(), APP_TIMEZONE);
}

/**
 * Convierte una fecha UTC a la zona horaria de Bogotá.
 */
export function toBogotaTime(
  date: Date | string | number
): Date {
  return toZonedTime(new Date(date), APP_TIMEZONE);
}

/**
 * Formatea una fecha en la zona horaria configurada.
 */
export function formatBogota(
  date: Date | string | number,
  pattern: string = "yyyy-MM-dd HH:mm:ss"
): string {
  return formatInTimeZone(
    new Date(date),
    APP_TIMEZONE,
    pattern
  );
}

/**
 * Obtiene YYYY-MM-DD de la fecha actual en Bogotá.
 */
export function getTodayDateString(): string {
  return formatInTimeZone(
    new Date(),
    APP_TIMEZONE,
    "yyyy-MM-dd"
  );
}