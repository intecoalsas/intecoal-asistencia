/**
 * Módulo Historial — Servicio de Períodos Semanales
 *
 * Responsabilidad única: identificar y garantizar la existencia de un
 * WeeklyPeriod (lunes–domingo, America/Bogota) para cualquier fecha dada.
 *
 * Garantías:
 *  - Idempotencia: múltiples llamadas para la misma semana devuelven el mismo registro.
 *  - Concurrencia: se usa upsert atómico de Prisma. Si dos peticiones llegan
 *    simultáneamente, la restricción @@unique([inicioSemana]) en la BD hace que
 *    sólo una inserte; la otra recibirá el registro existente vía findUnique.
 *  - No reinicia estados: si el período ya existe (cualquier EstadoPeriodo), lo
 *    devuelve tal cual sin modificar ningún campo.
 *  - Zona horaria: todas las fechas de negocio se calculan en America/Bogota.
 *    Los objetos Date que se persisten en campos @db.Date van normalizados a
 *    medianoche UTC (Date.UTC) para evitar el desplazamiento de 5 h que
 *    introduciría MySQL al interpretar un Date de JS con offset local.
 */

import { WeeklyPeriod } from "@prisma/client";
import { db } from "@/lib/db";
import { APP_TIMEZONE } from "@/lib/date-utils";
import { formatInTimeZone } from "date-fns-tz";

// ---------------------------------------------------------------------------
// Helpers de cálculo de semana
// ---------------------------------------------------------------------------

/**
 * Dado un Date (cualquier instante), calcula el lunes de esa semana
 * en términos del calendario de Bogotá y lo devuelve normalizado a
 * medianoche UTC.
 *
 * Estrategia:
 *  1. Obtener la fecha calendario en Bogotá como cadena "YYYY-MM-DD".
 *  2. Parsearla como componentes (year, month, day) — sin conversión de zona.
 *  3. Calcular el offset al lunes usando getUTCDay() sobre un Date.UTC.
 *  4. Restar el offset y devolver medianoche UTC del lunes resultante.
 *
 * JavaScript getUTCDay(): 0=domingo, 1=lunes, … 6=sábado.
 * Para semana lunes–domingo: offsetToMonday = (dow + 6) % 7
 *   - lunes   → 0  (no mueve)
 *   - martes  → 1
 *   - …
 *   - domingo → 6
 *
 * Nota: NO se usa getDay() (depende del TZ local del servidor) ni
 * se pasa el Date normalizado UTC de vuelta por formatInTimeZone, porque
 * un Date a medianoche UTC equivale a las 19:00 del día anterior en Bogotá
 * (UTC-5), lo que desplazaría el día en el 100 % de los casos.
 */
export function getInicioSemana(date: Date): Date {
  // Paso 1: fecha calendario en Bogotá como cadena.
  const fechaStr = formatInTimeZone(date, APP_TIMEZONE, "yyyy-MM-dd");
  const [year, month, day] = fechaStr.split("-").map(Number);

  // Paso 2: construir medianoche UTC de ese día calendario (sin volver a pasar
  // por formatInTimeZone para evitar el re-desplazamiento de zona horaria).
  const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0=dom
  const offsetToMonday = (dow + 6) % 7;

  // Paso 3: calcular medianoche UTC del lunes.
  return new Date(Date.UTC(year, month - 1, day - offsetToMonday));
}

/**
 * Dado el lunes de la semana (medianoche UTC), devuelve el domingo
 * correspondiente (también medianoche UTC).
 */
export function getFinSemana(inicioSemana: Date): Date {
  return new Date(inicioSemana.getTime() + 6 * 24 * 60 * 60 * 1000);
}

/**
 * Calcula el par {inicioSemana, finSemana} para cualquier Date dado,
 * usando la zona horaria de Bogotá para determinar qué semana
 * calendario corresponde.
 */
export function calcularRangoSemana(date: Date): {
  inicioSemana: Date;
  finSemana: Date;
} {
  const inicio = getInicioSemana(date);
  return { inicioSemana: inicio, finSemana: getFinSemana(inicio) };
}

// ---------------------------------------------------------------------------
// Servicio principal
// ---------------------------------------------------------------------------

/**
 * Obtiene el WeeklyPeriod correspondiente a `date` (en zona horaria Bogotá).
 * Si no existe, lo crea. Si existe, lo devuelve sin modificarlo.
 *
 * Concurrencia:
 *   Se intenta crear con upsert (create/update donde update es un no-op).
 *   Si hay una colisión de clave única (@@unique([inicioSemana])) por dos
 *   peticiones simultáneas, Prisma/MySQL resuelve la carrera a nivel de BD
 *   y ambas peticiones terminan con el mismo registro. No es necesario un
 *   bloqueo explícito porque upsert en MySQL es atómico via INSERT … ON
 *   DUPLICATE KEY UPDATE.
 */
export async function getOrCreateWeeklyPeriod(
  date: Date
): Promise<WeeklyPeriod> {
  const { inicioSemana, finSemana } = calcularRangoSemana(date);

  // upsert: si existe → devuelve sin cambios; si no → crea con estado ABIERTA
  const period = await db.weeklyPeriod.upsert({
    where: { inicioSemana },
    create: {
      inicioSemana,
      finSemana,
      // estado por defecto: ABIERTA (definido en schema)
    },
    update: {
      // No-op intencional: conserva el estado existente sin modificarlo.
      // Si el período ya existe en cualquier estado (CERRADA, REABIERTA, etc.),
      // se devuelve tal cual.
    },
  });

  return period;
}

/**
 * Obtiene el WeeklyPeriod vigente según la fecha/hora actual en Bogotá.
 * Equivalente a getOrCreateWeeklyPeriod(now) donde now = new Date().
 */
export async function getCurrentWeeklyPeriod(): Promise<WeeklyPeriod> {
  return getOrCreateWeeklyPeriod(new Date());
}

/**
 * Busca un WeeklyPeriod existente por fecha (Bogotá), sin crearlo.
 * Devuelve null si no existe todavía.
 */
export async function findWeeklyPeriod(
  date: Date
): Promise<WeeklyPeriod | null> {
  const { inicioSemana } = calcularRangoSemana(date);
  return db.weeklyPeriod.findUnique({ where: { inicioSemana } });
}

/**
 * Busca un WeeklyPeriod por su fecha de inicio exacta (medianoche UTC).
 * Útil para recuperar un período ya conocido sin recalcular.
 */
export async function findWeeklyPeriodByInicio(
  inicioSemana: Date
): Promise<WeeklyPeriod | null> {
  return db.weeklyPeriod.findUnique({ where: { inicioSemana } });
}

/**
 * Obtiene el WeeklyPeriod para una fecha laboral específica (string "YYYY-MM-DD").
 * Parsea la cadena en el contexto de Bogotá para evitar ambigüedades de zona horaria.
 * Se usa mediodía UTC (12:00) para que el instante siempre caiga en el mismo día
 * calendario de Bogotá (07:00 BOG), ya que medianoche UTC = 19:00 del día anterior.
 */
export async function getOrCreateWeeklyPeriodForDate(
  fechaStr: string
): Promise<WeeklyPeriod> {
  const [year, month, day] = fechaStr.split("-").map(Number);
  // 12:00 UTC = 07:00 Bogotá → mismo día calendario, sin riesgo de desplazamiento
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  return getOrCreateWeeklyPeriod(date);
}
