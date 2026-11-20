import { NextResponse } from "next/server";
import * as jwt from "jsonwebtoken";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { getNowUtc, getFechaLaboral } from "@/lib/date-utils";
import { getOrCreateWeeklyPeriod } from "@/modules/historial/weekly-period.service";
import type { TipoMarcacion, Prisma } from "@prisma/client";

// ---------------------------------------------------------------------------
// Control de espera cuando la base de datos está ocupada
// ---------------------------------------------------------------------------

/** Espera máxima (s) de una consulta por un bloqueo InnoDB dentro de la marcación. */
const LOCK_WAIT_TIMEOUT_S = 3;
/** Duración máxima de la transacción de marcación (debe superar la espera de bloqueo). */
const TX_TIMEOUT_MS = 10_000;
/** Espera máxima para obtener conexión e iniciar la transacción. */
const TX_MAX_WAIT_MS = 3_000;

const MENSAJE_BASE_OCUPADA =
  "El sistema está ocupado procesando otra operación. " +
  "Espera unos segundos y vuelve a escanear el código QR.";

/**
 * Ejecuta `fn` con innodb_lock_wait_timeout reducido solo para la sesión de
 * esta transacción y lo restaura al valor global al terminar, para no afectar
 * a otras operaciones que reutilicen la conexión del pool.
 */
async function conLimiteDeEsperaDeBloqueo<T>(
  tx: Prisma.TransactionClient,
  fn: () => Promise<T>
): Promise<T> {
  await tx.$executeRawUnsafe(
    `SET SESSION innodb_lock_wait_timeout = ${LOCK_WAIT_TIMEOUT_S}`
  );
  try {
    return await fn();
  } finally {
    try {
      await tx.$executeRawUnsafe("SET SESSION innodb_lock_wait_timeout = DEFAULT");
    } catch {
      // Si la transacción ya no admite consultas, la conexión se descarta/reinicia.
    }
  }
}

/** Errores de contención de BD (no funcionales) que deben responder 409 "ocupado". */
function esBaseDeDatosOcupada(err: unknown): boolean {
  const e = err as { code?: string; message?: string; meta?: { code?: string } };
  const msg = e.message ?? "";
  return (
    e.code === "P2034" || // conflicto de escritura / deadlock
    e.code === "P2028" || // transacción expirada o imposible de iniciar
    e.meta?.code === "1205" ||
    msg.includes("Lock wait timeout exceeded") ||
    msg.includes("deadlock") ||
    msg.includes("serialize")
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Decodifica el payload de un JWT sin verificar la firma.
 * Los datos NO son confiables hasta que se llama a jwt.verify().
 */
function decodeJwtPayload(
  token: string
): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  try {
    const decoded = Buffer.from(parts[1], "base64url").toString("utf8");
    const payload: unknown = JSON.parse(decoded);

    if (
      typeof payload !== "object" ||
      payload === null ||
      Array.isArray(payload)
    ) {
      return null;
    }

    return payload as Record<string, unknown>;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Endpoint principal
// ---------------------------------------------------------------------------

/**
 * POST /api/kiosk/attendance
 *
 * Body: { token: string }
 *
 * Registra la siguiente marcación del empleado autenticado.
 *
 * Flujo:
 *  1–10. Validaciones existentes (token, kiosco, empleado, horario, secuencia).
 *  11.   Limpieza oportunista de UsedQrToken expirados (fire-and-forget).
 *  12.   Verificar estado del período semanal e insertar en una sola
 *        transacción Serializable:
 *          - Registrar (userId, jti) en UsedQrToken → rechazo atómico si ya usó el token.
 *          - Si período CERRADA/PENDIENTE_CIERRE → LateMarcacion (upsert idempotente).
 *          - Si período ABIERTA/REABIERTA → Attendance normal.
 *        Un fallo en cualquier escritura hace rollback de todas.
 *
 * Protección concurrente:
 *  La transacción usa isolationLevel Serializable, que coincide con el nivel
 *  usado por closure.service.ts (cerrarPeriodo / reabrirPeriodo).
 *  MySQL InnoDB detecta conflictos de escritura entre transacciones Serializable
 *  y lanza error P2034, que se captura y se devuelve como 409.
 */
export const POST = requireRole(
  async (request: Request, user) => {
    try {
      // ---------------------------------------------------------------
      // 1. Validar cuerpo de la solicitud
      // ---------------------------------------------------------------

      let body: { token?: string };

      try {
        body = await request.json();
      } catch {
        return NextResponse.json(
          { error: "Solicitud no válida" },
          { status: 400 }
        );
      }

      const token = body?.token;

      if (typeof token !== "string" || !token.trim()) {
        return NextResponse.json(
          { error: "Falta el código QR" },
          { status: 400 }
        );
      }

      // ---------------------------------------------------------------
      // 2. Decodificar identificadores del QR (sin verificar firma aún)
      // ---------------------------------------------------------------

      const decoded = decodeJwtPayload(token);

      if (
        !decoded ||
        typeof decoded.kioskId !== "string" ||
        typeof decoded.jti !== "string" ||
        !decoded.kioskId ||
        !decoded.jti
      ) {
        return NextResponse.json(
          { error: "El código QR no es válido" },
          { status: 400 }
        );
      }

      const kioskId = decoded.kioskId;
      const jti = decoded.jti;

      // ---------------------------------------------------------------
      // 3. Buscar kiosco activo
      // ---------------------------------------------------------------

      const kiosk = await db.kioskDevice.findFirst({
        where: { id: kioskId, isActive: true },
      });

      if (!kiosk) {
        return NextResponse.json(
          { error: "El kiosco no es válido o está inactivo" },
          { status: 403 }
        );
      }

      // ---------------------------------------------------------------
      // 4. Verificar firma y expiración del QR
      //    jwt.verify lanza si el token está expirado o la firma es inválida.
      // ---------------------------------------------------------------

      let verifiedPayload: jwt.JwtPayload;

      try {
        verifiedPayload = jwt.verify(token, kiosk.secretKey, {
          algorithms: ["HS256"],
        }) as jwt.JwtPayload;
      } catch (error) {
        const expirado =
          error instanceof Error && error.name === "TokenExpiredError";
        return NextResponse.json(
          {
            error: expirado
              ? "El código QR expiró. Escanea el código actualizado del kiosco."
              : "El código QR no es válido. Escanea el código actualizado del kiosco.",
          },
          { status: 401 }
        );
      }

      // Extraer expiresAt del campo exp del JWT verificado (segundos → ms).
      // Condición 1 de la autorización: usar exp del token, no Date.now()+30s.
      const jwtExp = verifiedPayload.exp;
      const expiresAt =
        typeof jwtExp === "number"
          ? new Date(jwtExp * 1000)
          : new Date(Date.now() + 30_000); // fallback defensivo

      // ---------------------------------------------------------------
      // 5. Verificar empleado activo
      // ---------------------------------------------------------------

      if (!user.isActive) {
        return NextResponse.json(
          { error: "Usuario inactivo" },
          { status: 403 }
        );
      }

      // ---------------------------------------------------------------
      // 6. Calcular fecha laboral en Bogotá
      // ---------------------------------------------------------------

      const timestampUTC = getNowUtc();
      const fechaLaboral = getFechaLaboral(timestampUTC);

      // ---------------------------------------------------------------
      // 7. Obtener horario vigente
      // ---------------------------------------------------------------

      const assignment = await db.employeeScheduleAssignment.findFirst({
        where: {
          userId: user.id,
          validFrom: { lte: fechaLaboral },
          OR: [
            { validUntil: null },
            { validUntil: { gte: fechaLaboral } },
          ],
        },
        include: { policy: { include: { dayRules: true } } },
      });

      if (!assignment) {
        return NextResponse.json(
          { error: "No tienes un horario asignado para hoy" },
          { status: 400 }
        );
      }

      // ---------------------------------------------------------------
      // 8. Determinar día de la semana en Bogotá
      //    getFechaLaboral devuelve medianoche UTC → usar getUTCDay().
      // ---------------------------------------------------------------

      const weekday = fechaLaboral.getUTCDay();
      const days = [
        "DOMINGO",
        "LUNES",
        "MARTES",
        "MIERCOLES",
        "JUEVES",
        "VIERNES",
        "SABADO",
      ];
      const diaEnum = days[weekday];

      const dayRule = assignment.policy.dayRules.find(
        (rule) => rule.dia === diaEnum && rule.esLaboral
      );

      if (!dayRule) {
        return NextResponse.json(
          { error: "Hoy no es un día laboral en tu horario" },
          { status: 400 }
        );
      }

      // ---------------------------------------------------------------
      // 9. Secuencia de marcaciones
      // ---------------------------------------------------------------

      const sequence: TipoMarcacion[] = [
        "ENTRADA_MANANA",
        "SALIDA_ALMUERZO",
        "ENTRADA_ALMUERZO",
        "SALIDA_JORNADA",
      ];

      // ---------------------------------------------------------------
      // 10. Consultar registros existentes del día y calcular nextTipo
      // ---------------------------------------------------------------

      //     Se consideran:
      //       - Attendance del día (incluye las INCORPORADAS, que ya tienen
      //         su Attendance; por eso no se cuentan aparte).
      //       - LateMarcacion PENDIENTE del día (aún sin Attendance).
      //       - LateMarcacion RECHAZADA del día: consume su posición en la
      //         secuencia (no se puede volver a registrar ese tipo), pero
      //         nunca se contabiliza como asistencia ni genera Attendance.
      //     Las INCORPORADAS no se consultan aquí: ya cuentan vía su Attendance.
      const [attendancesDia, tardiasQueConsumenPosicion] = await Promise.all([
        db.attendance.findMany({
          where: { userId: user.id, fechaLaboral },
          select: { tipo: true },
        }),
        db.lateMarcacion.findMany({
          where: {
            userId: user.id,
            fechaLaboral,
            estado: { in: ["PENDIENTE", "RECHAZADA"] },
          },
          select: { tipo: true },
        }),
      ]);

      // Solo para calcular la posición en la secuencia; no es un conteo de asistencias.
      const existing = [...attendancesDia, ...tardiasQueConsumenPosicion];

      const existingTypeSet = new Set(existing.map((a) => a.tipo));
      const expectedTypes = sequence.slice(0, existing.length);

      const validSequence =
        existing.length <= sequence.length &&
        existingTypeSet.size === existing.length &&
        expectedTypes.every((type) => existingTypeSet.has(type));

      if (!validSequence) {
        return NextResponse.json(
          { error: "Marcaciones fuera de secuencia" },
          { status: 409 }
        );
      }

      if (existing.length >= sequence.length) {
        return NextResponse.json(
          { error: "Todas las marcaciones ya fueron registradas" },
          { status: 409 }
        );
      }

      const nextTipo = sequence[existing.length];

      // ---------------------------------------------------------------
      // 11. Limpieza oportunista de tokens expirados (fire-and-forget)
      //     No bloquea la respuesta; los fallos son silenciosos.
      // ---------------------------------------------------------------

      void db.usedQrToken
        .deleteMany({ where: { expiresAt: { lt: new Date() } } })
        .catch(() => {
          // Silenciar: la limpieza no es crítica para la operación.
        });

      // ---------------------------------------------------------------
      // 12. Transacción atómica Serializable:
      //     A. Registrar (userId, jti) → falla si el empleado ya usó este token.
      //     B. Consultar estado del período semanal.
      //     C. Crear Attendance (semana abierta) o LateMarcacion (semana cerrada).
      //
      //     El nivel Serializable es el mismo que usa closure.service.ts,
      //     lo que garantiza que dos transacciones que lean/escriban el mismo
      //     WeeklyPeriod entren en conflicto detectable (P2034) si se intercalan.
      //     Un fallo en cualquier paso hace rollback de todo el bloque.
      // ---------------------------------------------------------------

      try {
        return await db.$transaction(
          async (tx) => conLimiteDeEsperaDeBloqueo(tx, async () => {
            // ── A. Protección (userId, jti) ───────────────────────────
            //
            // Intentar insertar el token usado para este empleado.
            // Si ya existe (@@unique[userId, jti]) → P2002 → 409.
            // Si falla el paso C, esta inserción también hace rollback
            // y el token queda disponible para el empleado.
            try {
              await tx.usedQrToken.create({
                data: { userId: user.id, jti, expiresAt },
              });
            } catch (err) {
              const e = err as { code?: string };
              if (e.code === "P2002") {
                return NextResponse.json(
                  {
                    error:
                      "Este QR ya fue utilizado. Escanea el código actualizado del kiosco.",
                  },
                  { status: 409 }
                );
              }
              throw err;
            }

            // ── B. Consultar estado del período semanal ───────────────
            //
            // La lectura ocurre dentro de la transacción Serializable:
            // si closure.service.ts cierra el período concurrentemente,
            // MySQL detecta el conflicto → P2034.
            const period = await getOrCreateWeeklyPeriod(timestampUTC);

            // Re-leer dentro del contexto de la transacción para que el
            // snapshot serializable incluya esta lectura.
            const periodTx = await tx.weeklyPeriod.findUnique({
              where: { id: period.id },
              select: { id: true, estado: true },
            });

            if (!periodTx) {
              // Situación inesperada: getOrCreateWeeklyPeriod acaba de crearlo.
              throw new Error(
                `Período ${period.id} no encontrado tras creación.`
              );
            }

            const estadoPeriodo = periodTx.estado;

            // ── C. Crear registro según estado del período ────────────

            if (
              estadoPeriodo === "CERRADA" ||
              estadoPeriodo === "PENDIENTE_CIERRE"
            ) {
              // Semana cerrada: registrar como marcación tardía.
              // Si ya existe una LateMarcacion para (userId, fechaLaboral, tipo)
              // —p. ej. una RECHAZADA, o una creada por una solicitud concurrente—
              // se responde 409 sin sobrescribir ni duplicar el registro.
              // No se modifica ni se reabre la semana cerrada.
              const conflictoTardia = (estado?: string) =>
                NextResponse.json(
                  {
                    error:
                      estado === "RECHAZADA"
                        ? `La marcación ${nextTipo} de esta fecha ya fue rechazada por un administrador. No se puede registrar de nuevo.`
                        : `Ya existe una marcación tardía ${nextTipo} para esta fecha${
                            estado ? ` (estado: ${estado})` : ""
                          }. No se registró de nuevo.`,
                  },
                  { status: 409 }
                );

              const previa = await tx.lateMarcacion.findUnique({
                where: {
                  userId_fechaLaboral_tipo: {
                    userId: user.id,
                    fechaLaboral,
                    tipo: nextTipo,
                  },
                },
                select: { estado: true },
              });
              if (previa) return conflictoTardia(previa.estado);

              let lateMarcacion: { id: string };
              try {
                lateMarcacion = await tx.lateMarcacion.create({
                  data: {
                    weeklyPeriodId: periodTx.id,
                    userId: user.id,
                    tipo: nextTipo,
                    fechaLaboral,
                    timestampRealizacionUTC: timestampUTC,
                    timestampRecepcionUTC: timestampUTC,
                    kioskId: kiosk.id,
                    estado: "PENDIENTE",
                  },
                  select: { id: true },
                });
              } catch (err) {
                const e = err as { code?: string };
                if (e.code === "P2002") return conflictoTardia();
                throw err;
              }

              return NextResponse.json(
                {
                  lateMarcacion: true,
                  lateMarcacionId: lateMarcacion.id,
                  tipo: nextTipo,
                  message:
                    "Tu marcación fue recibida fuera del plazo de la semana. " +
                    "Quedará pendiente de revisión administrativa.",
                },
                { status: 202 }
              );
            }

            // Semana ABIERTA o REABIERTA: flujo normal.
            try {
              const attendance = await tx.attendance.create({
                data: {
                  userId: user.id,
                  kioskId: kiosk.id,
                  tipo: nextTipo,
                  fechaLaboral,
                },
              });

              return NextResponse.json(
                {
                  success: true,
                  attendanceId: attendance.id,
                  tipo: nextTipo,
                },
                { status: 201 }
              );
            } catch (err) {
              const e = err as { code?: string; meta?: { target?: string | string[] } };
              if (e.code === "P2002") {
                const target = Array.isArray(e.meta?.target)
                  ? e.meta.target.join(", ")
                  : String(e.meta?.target ?? "desconocido");

                return NextResponse.json(
                  {
                    error:
                      target.includes("userId") &&
                      target.includes("fechaLaboral") &&
                      target.includes("tipo")
                        ? "Ya existe una marcación de este tipo para esta fecha."
                        : "Se produjo un conflicto de unicidad al registrar la marcación.",
                  },
                  { status: 409 }
                );
              }
              throw err;
            }
          }),
          {
            isolationLevel: "Serializable" as Prisma.TransactionIsolationLevel,
            // La espera de bloqueo (LOCK_WAIT_TIMEOUT_S) vence antes que la
            // transacción, para que MySQL corte la consulta bloqueada y la
            // transacción haga rollback de forma controlada.
            timeout: TX_TIMEOUT_MS,
            maxWait: TX_MAX_WAIT_MS,
          }
        );
      } catch (err) {
        // ── Base de datos ocupada / contención de transacciones ───────
        //
        // Espera de bloqueo agotada (1205), deadlock o conflicto de
        // serialización (P2034), o transacción expirada / sin conexión
        // disponible (P2028). Ningún registro queda escrito (rollback
        // automático), incluido UsedQrToken: el QR no se consume.
        if (esBaseDeDatosOcupada(err)) {
          console.warn("[POST /api/kiosk/attendance] Base de datos ocupada:", (err as { code?: string }).code ?? "sin código");
          return NextResponse.json(
            { error: MENSAJE_BASE_OCUPADA },
            { status: 409 }
          );
        }

        throw err;
      }
    } catch (error) {
      console.error("[POST /api/kiosk/attendance] Error:", error);
      return NextResponse.json(
        { error: "Error interno al procesar la marcación" },
        { status: 500 }
      );
    }
  },
  ["EMPLEADO"]
);
