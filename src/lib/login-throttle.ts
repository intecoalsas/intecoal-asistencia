// src/lib/login-throttle.ts
/**
 * F4 — Límite de intentos fallidos de inicio de sesión (por cuenta).
 *
 * - La cuenta se identifica con SHA-256("CUENTA:" + identificador normalizado).
 *   No se almacenan correos, documentos ni contraseñas.
 * - 5 fallos dentro de una ventana de 15 min → bloqueo de 15 min.
 * - Durante un bloqueo vigente los fallos no cambian el contador ni prolongan
 *   el bloqueo.
 * - Un login correcto elimina el contador solo si no hay bloqueo vigente.
 * - Todas las escrituras son sentencias SQL atómicas (válidas con varias
 *   instancias del servidor): el estado se calcula dentro de la sentencia con
 *   UTC_TIMESTAMP(3), que es constante durante su ejecución.
 */
import { createHash, randomUUID } from "crypto";
import { db } from "@/lib/db";

export const MAX_INTENTOS = 5;
export const VENTANA_MIN = 15;
export const BLOQUEO_MIN = 15;
const RETENCION_HORAS = 24;

/** Clave hash de la cuenta. Normaliza: minúsculas y sin espacios. */
export function claveCuenta(identificador: string): string {
  const normalizado = identificador.toLowerCase().replace(/\s+/g, "");
  return createHash("sha256").update(`CUENTA:${normalizado}`).digest("hex");
}

/**
 * Devuelve los minutos restantes de bloqueo (redondeados hacia arriba) o null
 * si la cuenta no está bloqueada.
 */
export async function minutosDeBloqueo(clave: string): Promise<number | null> {
  const filas = await db.$queryRaw<{ restanteMs: bigint | number | null }[]>`
    SELECT TIMESTAMPDIFF(MICROSECOND, UTC_TIMESTAMP(3), bloqueadoHasta) / 1000 AS restanteMs
    FROM login_throttles
    WHERE clave = ${clave} AND bloqueadoHasta IS NOT NULL AND bloqueadoHasta > UTC_TIMESTAMP(3)
    LIMIT 1`;
  if (filas.length === 0 || filas[0].restanteMs === null) return null;
  return Math.max(1, Math.ceil(Number(filas[0].restanteMs) / 60_000));
}

/**
 * Registra un intento fallido de forma atómica y devuelve los minutos de
 * bloqueo vigentes tras el registro (null si no quedó bloqueada).
 *
 * En ON DUPLICATE KEY UPDATE, MySQL evalúa las asignaciones en orden y las
 * posteriores ven los valores ya asignados. Por eso:
 *   1. `intentos` y `ventanaInicio` se calculan con el `bloqueadoHasta` y
 *      `ventanaInicio` originales.
 *   2. `bloqueadoHasta` se calcula al final con el `intentos` ya actualizado.
 */
export async function registrarFallo(clave: string): Promise<number | null> {
  await db.$executeRaw`
    INSERT INTO login_throttles (id, clave, tipo, intentos, ventanaInicio, bloqueadoHasta, updatedAt)
    VALUES (${randomUUID()}, ${clave}, 'CUENTA', 1, UTC_TIMESTAMP(3),
            IF(1 >= ${MAX_INTENTOS}, UTC_TIMESTAMP(3) + INTERVAL ${BLOQUEO_MIN} MINUTE, NULL), UTC_TIMESTAMP(3))
    ON DUPLICATE KEY UPDATE
      intentos = IF(bloqueadoHasta IS NOT NULL AND bloqueadoHasta > UTC_TIMESTAMP(3),
                    intentos,
                    IF(ventanaInicio <= UTC_TIMESTAMP(3) - INTERVAL ${VENTANA_MIN} MINUTE, 1, intentos + 1)),
      ventanaInicio = IF(bloqueadoHasta IS NOT NULL AND bloqueadoHasta > UTC_TIMESTAMP(3),
                         ventanaInicio,
                         IF(ventanaInicio <= UTC_TIMESTAMP(3) - INTERVAL ${VENTANA_MIN} MINUTE, UTC_TIMESTAMP(3), ventanaInicio)),
      bloqueadoHasta = IF(bloqueadoHasta IS NOT NULL AND bloqueadoHasta > UTC_TIMESTAMP(3),
                          bloqueadoHasta,
                          IF(intentos >= ${MAX_INTENTOS}, UTC_TIMESTAMP(3) + INTERVAL ${BLOQUEO_MIN} MINUTE, NULL)),
      updatedAt = UTC_TIMESTAMP(3)`;
  return minutosDeBloqueo(clave);
}

/**
 * Login correcto: elimina el contador solo si no hay un bloqueo vigente
 * (condición evaluada atómicamente en la propia sentencia).
 */
export async function registrarExito(clave: string): Promise<void> {
  await db.$executeRaw`
    DELETE FROM login_throttles
    WHERE clave = ${clave} AND (bloqueadoHasta IS NULL OR bloqueadoHasta <= UTC_TIMESTAMP(3))`;
}

/** Limpieza oportunista de registros sin actividad en las últimas 24 h. */
export function limpiarRegistrosAntiguos(): void {
  void db.$executeRaw`
    DELETE FROM login_throttles
    WHERE updatedAt < UTC_TIMESTAMP(3) - INTERVAL ${RETENCION_HORAS} HOUR`.catch(() => {
    // Silencioso: la limpieza no es crítica para el login.
  });
}

export function mensajeBloqueo(minutos: number): string {
  return `Demasiados intentos fallidos. Espera ${minutos} ${
    minutos === 1 ? "minuto" : "minutos"
  } e intenta de nuevo`;
}
