/**
 * Módulo Historial — Servicio de Marcaciones Tardías (LateMarcacion)
 *
 * Fase 5: gestión de marcaciones recibidas después del cierre del período.
 *
 * Responsabilidades:
 *  - registrarMarcacionTardia: registra una marcación que llegó fuera de plazo.
 *  - listarPendientes: consulta bandeja de ADMIN.
 *  - incorporarMarcacion: reabre período, crea Attendance, vuelve a cerrar.
 *  - rechazarMarcacion: persiste decisión de rechazo con motivo.
 *
 * ─── Reglas de negocio ───────────────────────────────────────────────────────
 *
 *  1. Solo ADMIN puede invocar listarPendientes, incorporarMarcacion y
 *     rechazarMarcacion. El servicio recibe el rol como parámetro y verifica.
 *
 *  2. registrarMarcacionTardia puede ser llamado por cualquier código interno
 *     (endpoint de kiosco que detecte que el período ya está cerrado).
 *
 *  3. Idempotencia de registro: @@unique([userId, fechaLaboral, tipo]) impide
 *     registrar dos veces la misma marca tardía para el mismo empleado/día/tipo.
 *
 *  4. incorporarMarcacion:
 *     a. Verifica que la LateMarcacion esté PENDIENTE.
 *     b. Verifica que el período esté CERRADA (única condición legal).
 *     c. Reabre el período y audita la reapertura (REOPEN_WEEKLY_PERIOD).
 *     d. Crea el Attendance.
 *     e. Marca la LateMarcacion como INCORPORADA (UPDATE condicional a PENDIENTE).
 *     f. Cierra nuevamente generando nueva versión MANUAL_ADMIN.
 *     Los pasos a-f se ejecutan en UNA transacción Serializable: si alguno
 *     falla no queda ningún cambio. La consolidación se ejecuta después,
 *     fuera de la transacción, y es idempotente (recuperarConsolidacion).
 *
 *  5. rechazarMarcacion: transición condicional PENDIENTE → RECHAZADA con
 *     motivo, y AttendanceAuditLog REJECT_LATE_MARCACION, en una transacción
 *     Serializable. No toca Attendance ni el período.
 *
 *  6. El Attendance creado al incorporar usa fechaLaboral de la LateMarcacion
 *     y timestampRealizacionUTC como createdAt (momento real del empleado).
 *
 * ─── Limitación documentada ──────────────────────────────────────────────────
 *
 *  consolidarPeriodo se llama al incorporar para actualizar el consolidado de
 *  la nueva versión. Si falla, el cierre queda sin consolidar (patrón igual a
 *  Fase 4). El operador puede ejecutar recuperarConsolidacion directamente.
 */

import {
  LateMarcacion,
  EstadoMarcacionTardia,
  TipoMarcacion,
  Role,
  EstadoPeriodo,
  Prisma,
} from "@prisma/client";
import { db } from "@/lib/db";
import { HistorialError } from "./closure.service";
import type { HistorialErrorCode } from "./closure.service";
import { reabrirPeriodoEnTx, cerrarPeriodoEnTx, consolidarConRegistro } from "./periodo-tx.service";

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export interface RegistrarMarcacionTardiaInput {
  weeklyPeriodId: string;
  userId: string;
  tipo: TipoMarcacion;
  /** Fecha calendario (midnight UTC) a la que pertenece la marcación. */
  fechaLaboral: Date;
  /** Momento en que el empleado realizó la acción (timestamp del kiosco). */
  timestampRealizacionUTC: Date;
  /** Momento en que el servidor recibió la petición. */
  timestampRecepcionUTC: Date;
  kioskId?: string | null;
}

export interface IncorporarMarcacionInput {
  lateMarcacionId: string;
  /** UUID del ADMIN que autoriza. */
  adminId: string;
  /** Rol del actor — debe ser ADMIN. */
  adminRole: Role;
  /** Motivo obligatorio de la incorporación. */
  motivo: string;
}

export interface RechazarMarcacionInput {
  lateMarcacionId: string;
  adminId: string;
  adminRole: Role;
  motivo: string;
}

export interface ListarPendientesInput {
  adminRole: Role;
  /** Filtrar por weeklyPeriodId (opcional). */
  weeklyPeriodId?: string;
  /** Filtrar por userId del empleado (opcional). */
  userId?: string;
}

export interface IncorporarMarcacionResult {
  lateMarcacion: LateMarcacion;
  /** ID del Attendance creado. */
  attendanceId: string;
  /** ID del nuevo WeeklyClosure generado tras reabrir y cerrar. */
  nuevoCierreId: string;
}

// ---------------------------------------------------------------------------
// Helper de verificación de rol
// ---------------------------------------------------------------------------

function requireAdmin(role: Role): void {
  if (role !== Role.ADMIN) {
    throw new HistorialError(
      "ROLE_REQUIRED" as HistorialErrorCode,
      "Solo ADMIN puede gestionar marcaciones tardías."
    );
  }
}

// ---------------------------------------------------------------------------
// Operación: registrar marcación tardía
// ---------------------------------------------------------------------------

/**
 * Registra una marcación que llegó después del cierre del período al que pertenece.
 *
 * Idempotente: si ya existe una LateMarcacion para (userId, fechaLaboral, tipo),
 * devuelve la existente sin crear un duplicado.
 *
 * Esta función NO verifica roles — el caller (endpoint de kiosco) es responsable
 * de autenticar la fuente.
 */
export async function registrarMarcacionTardia(
  input: RegistrarMarcacionTardiaInput
): Promise<LateMarcacion> {
  // Verificar que el período existe
  const periodo = await db.weeklyPeriod.findUnique({
    where: { id: input.weeklyPeriodId },
  });
  if (!periodo) {
    throw new HistorialError(
      "PERIOD_NOT_FOUND",
      `Período ${input.weeklyPeriodId} no encontrado.`
    );
  }

  // Idempotencia: usar upsert sobre la restricción unique (userId, fechaLaboral, tipo)
  return db.lateMarcacion.upsert({
    where: {
      userId_fechaLaboral_tipo: {
        userId: input.userId,
        fechaLaboral: input.fechaLaboral,
        tipo: input.tipo,
      },
    },
    create: {
      weeklyPeriodId: input.weeklyPeriodId,
      userId: input.userId,
      tipo: input.tipo,
      fechaLaboral: input.fechaLaboral,
      timestampRealizacionUTC: input.timestampRealizacionUTC,
      timestampRecepcionUTC: input.timestampRecepcionUTC,
      kioskId: input.kioskId ?? null,
      estado: EstadoMarcacionTardia.PENDIENTE,
    },
    update: {
      // No-op: conservar el registro original sin modificarlo.
    },
  });
}

// ---------------------------------------------------------------------------
// Operación: listar pendientes
// ---------------------------------------------------------------------------

/**
 * Devuelve las LateMarcacion en estado PENDIENTE.
 * Exclusivo para ADMIN.
 */
export async function listarPendientes(
  input: ListarPendientesInput
): Promise<LateMarcacion[]> {
  requireAdmin(input.adminRole);

  return db.lateMarcacion.findMany({
    where: {
      estado: EstadoMarcacionTardia.PENDIENTE,
      ...(input.weeklyPeriodId ? { weeklyPeriodId: input.weeklyPeriodId } : {}),
      ...(input.userId ? { userId: input.userId } : {}),
    },
    orderBy: [{ fechaLaboral: "asc" }, { createdAt: "asc" }],
  });
}

// ---------------------------------------------------------------------------
// Helpers transaccionales internos
// ---------------------------------------------------------------------------

type Tx = Prisma.TransactionClient;

/** Verifica dentro de la transacción que el actor sea un ADMIN activo. */
async function verificarAdminActivo(tx: Tx, adminId: string): Promise<void> {
  const admin = await tx.user.findUnique({
    where: { id: adminId },
    select: { role: true, isActive: true },
  });
  if (!admin || !admin.isActive || admin.role !== Role.ADMIN) {
    throw new HistorialError(
      "ROLE_REQUIRED",
      "Solo un ADMIN activo puede gestionar marcaciones tardías."
    );
  }
}

/**
 * Transición atómica PENDIENTE → nuevo estado.
 * Usa un UPDATE condicional (WHERE estado = PENDIENTE): si otra operación ya
 * procesó la marcación, count = 0 y se lanza error sin modificar nada.
 */
async function reclamarPendiente(
  tx: Tx,
  lateMarcacionId: string,
  data: Prisma.LateMarcacionUncheckedUpdateManyInput,
  accion: "incorporar" | "rechazar"
): Promise<void> {
  const { count } = await tx.lateMarcacion.updateMany({
    where: { id: lateMarcacionId, estado: EstadoMarcacionTardia.PENDIENTE },
    data,
  });
  if (count === 1) return;

  const actual = await tx.lateMarcacion.findUnique({
    where: { id: lateMarcacionId },
    select: { estado: true },
  });
  if (!actual) {
    throw new HistorialError(
      "PERIOD_NOT_FOUND",
      `LateMarcacion ${lateMarcacionId} no encontrada.`
    );
  }
  throw new HistorialError(
    "INVALID_STATE",
    `La marcación tardía ya fue procesada (estado: ${actual.estado}). No se puede ${accion} de nuevo.`
  );
}

/** Traduce errores de serialización/deadlock de MySQL a HistorialError(CONFLICT). */
function traducirConflicto(err: unknown, accion: string): never {
  if (err instanceof HistorialError) throw err;
  const e = err as { code?: string; message?: string };
  if (
    e.code === "P2034" ||
    e.message?.includes("deadlock") ||
    e.message?.includes("serialize")
  ) {
    throw new HistorialError(
      "CONFLICT",
      `Conflicto de concurrencia al ${accion} la marcación tardía. Reintente la operación.`
    );
  }
  throw err;
}

// ---------------------------------------------------------------------------
// Operación: incorporar marcación
// ---------------------------------------------------------------------------

/**
 * Incorpora una marcación tardía al período correspondiente.
 *
 * Atomicidad: todos los cambios de datos se ejecutan en UNA transacción
 * Serializable. Si cualquier paso falla, no queda ningún cambio persistido
 * (ni reapertura, ni Attendance, ni cambio de estado, ni cierre).
 *
 * No se invocan reabrirPeriodo/cerrarPeriodo porque cada uno abre su propia
 * transacción y no aceptan un cliente transaccional; encadenarlos producía
 * estados parciales. Se reproducen sus mismos efectos y validaciones:
 *  - Reapertura: CERRADA → REABIERTA + AttendanceAuditLog REOPEN_WEEKLY_PERIOD.
 *  - Cierre: WeeklyClosure MANUAL_ADMIN con version = MAX + 1 → CERRADA.
 *
 * Flujo dentro de la transacción:
 *  1. Verificar ADMIN activo.
 *  2. Leer la LateMarcacion (debe estar PENDIENTE) y el período (CERRADA).
 *  3. Reabrir el período y auditar la reapertura.
 *  4. Crear el Attendance.
 *  5. Transición condicional PENDIENTE → INCORPORADA (con attendanceId).
 *  6. Crear la nueva versión de cierre y dejar el período CERRADA.
 *
 * Fuera de la transacción (best-effort, idempotente):
 *  7. consolidarPeriodo para la nueva versión. Si falla, el cierre ya es
 *     coherente y puede repetirse con recuperarConsolidacion(cierreId, periodoId).
 *
 * Concurrencia: dos incorporaciones/rechazos simultáneos sobre la misma marcación
 * o sobre el mismo período colisionan en la transacción Serializable; uno
 * termina y el otro recibe INVALID_STATE (ya procesada / período no CERRADA)
 * o CONFLICT (colisión de serialización), sin efectos parciales.
 */
export async function incorporarMarcacion(
  input: IncorporarMarcacionInput
): Promise<IncorporarMarcacionResult> {
  requireAdmin(input.adminRole);

  if (!input.motivo?.trim()) {
    throw new HistorialError(
      "MOTIVO_REQUIRED",
      "El motivo de incorporación es obligatorio."
    );
  }
  const motivo = input.motivo.trim();

  let resultado: {
    lateMarcacion: LateMarcacion;
    attendanceId: string;
    cierreId: string;
    weeklyPeriodId: string;
  };

  try {
    resultado = await db.$transaction(
      async (tx) => {
        // 1. Actor
        await verificarAdminActivo(tx, input.adminId);

        // 2. Marcación y período
        const lm = await tx.lateMarcacion.findUnique({
          where: { id: input.lateMarcacionId },
        });
        if (!lm) {
          throw new HistorialError(
            "PERIOD_NOT_FOUND",
            `LateMarcacion ${input.lateMarcacionId} no encontrada.`
          );
        }
        if (lm.estado !== EstadoMarcacionTardia.PENDIENTE) {
          throw new HistorialError(
            "INVALID_STATE",
            `La marcación tardía ya fue procesada (estado: ${lm.estado}). No se puede incorporar de nuevo.`
          );
        }

        const periodo = await tx.weeklyPeriod.findUnique({
          where: { id: lm.weeklyPeriodId },
        });
        if (!periodo) {
          throw new HistorialError(
            "PERIOD_NOT_FOUND",
            `Período ${lm.weeklyPeriodId} no encontrado.`
          );
        }
        if (periodo.estado !== EstadoPeriodo.CERRADA) {
          throw new HistorialError(
            "INVALID_STATE",
            `Solo se puede incorporar sobre un período CERRADA. Estado actual: ${periodo.estado}.`
          );
        }

        // 3. Reapertura auditada (mismos efectos que reabrirPeriodo)
        await reabrirPeriodoEnTx(
          tx,
          periodo.id,
          input.adminId,
          `Incorporación de marcación tardía (LateMarcacion ID: ${lm.id}). ${motivo}`
        );

        // 4. Attendance (unique [userId, fechaLaboral, tipo] impide duplicados)
        let attendance: { id: string };
        try {
          attendance = await tx.attendance.create({
            data: {
              userId: lm.userId,
              tipo: lm.tipo,
              fechaLaboral: lm.fechaLaboral,
              kioskId: lm.kioskId,
              // createdAt = momento real del empleado; updatedAt = ahora
              createdAt: lm.timestampRealizacionUTC,
              updatedAt: new Date(),
            },
            select: { id: true },
          });
        } catch (err) {
          const e = err as { code?: string };
          if (e.code === "P2002") {
            throw new HistorialError(
              "CONFLICT",
              `Ya existe un Attendance para (userId=${lm.userId}, ` +
                `fechaLaboral=${lm.fechaLaboral.toISOString()}, tipo=${lm.tipo}). ` +
                "No se incorporó la marcación; no se realizó ningún cambio."
            );
          }
          throw err;
        }

        // 5. Transición condicional PENDIENTE → INCORPORADA
        const resueltaEn = new Date();
        await reclamarPendiente(
          tx,
          lm.id,
          {
            estado: EstadoMarcacionTardia.INCORPORADA,
            adminId: input.adminId,
            motivoRechazo: null, // campo multipropósito: null en incorporación
            attendanceId: attendance.id,
            resueltaEn,
          },
          "incorporar"
        );

        // 6. Nueva versión de cierre (mismos efectos que cerrarPeriodo)
        const cierre = await cerrarPeriodoEnTx(
          tx,
          periodo.id,
          input.adminId,
          `Cierre tras incorporación de marcación tardía. ${motivo}`
        );

        const actualizada = await tx.lateMarcacion.findUniqueOrThrow({
          where: { id: lm.id },
        });

        return {
          lateMarcacion: actualizada,
          attendanceId: attendance.id,
          cierreId: cierre.id,
          weeklyPeriodId: periodo.id,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  } catch (err) {
    traducirConflicto(err, "incorporar");
  }

  // 7. Consolidación (fuera de la transacción, idempotente; un fallo queda
  //    registrado como ClosureAttempt CONSOLIDACION_FALLIDA)
  await consolidarConRegistro(
    resultado.cierreId,
    resultado.weeklyPeriodId,
    "incorporación de marcación tardía"
  );

  return {
    lateMarcacion: resultado.lateMarcacion,
    attendanceId: resultado.attendanceId,
    nuevoCierreId: resultado.cierreId,
  };
}

// ---------------------------------------------------------------------------
// Operación: rechazar marcación
// ---------------------------------------------------------------------------

/**
 * Rechaza una marcación tardía. No toca Attendance ni el período.
 * El registro original LateMarcacion se conserva con estado RECHAZADA.
 *
 * Atomicidad y concurrencia: en una transacción Serializable se verifica el
 * ADMIN, se aplica la transición condicional PENDIENTE → RECHAZADA (UPDATE ...
 * WHERE estado = PENDIENTE) y se registra el AttendanceAuditLog
 * REJECT_LATE_MARCACION. Si otra operación ya procesó la marcación, el UPDATE
 * no afecta filas y se lanza INVALID_STATE sin cambios; una colisión de
 * serialización se informa como CONFLICT.
 */
export async function rechazarMarcacion(
  input: RechazarMarcacionInput
): Promise<LateMarcacion> {
  requireAdmin(input.adminRole);

  if (!input.motivo?.trim()) {
    throw new HistorialError(
      "MOTIVO_REQUIRED",
      "El motivo de rechazo es obligatorio."
    );
  }
  const motivo = input.motivo.trim();

  try {
    return await db.$transaction(
      async (tx) => {
        await verificarAdminActivo(tx, input.adminId);

        const resueltaEn = new Date();
        await reclamarPendiente(
          tx,
          input.lateMarcacionId,
          {
            estado: EstadoMarcacionTardia.RECHAZADA,
            adminId: input.adminId,
            motivoRechazo: motivo,
            resueltaEn,
          },
          "rechazar"
        );

        const rechazada = await tx.lateMarcacion.findUniqueOrThrow({
          where: { id: input.lateMarcacionId },
        });

        await tx.attendanceAuditLog.create({
          data: {
            adminId: input.adminId,
            accion: "REJECT_LATE_MARCACION",
            motivo,
            valoresAnteriores: {
              lateMarcacionId: rechazada.id,
              weeklyPeriodId: rechazada.weeklyPeriodId,
              userId: rechazada.userId,
              tipo: rechazada.tipo,
              fechaLaboral: rechazada.fechaLaboral.toISOString(),
              estado: EstadoMarcacionTardia.PENDIENTE,
            },
            valoresNuevos: {
              lateMarcacionId: rechazada.id,
              estado: EstadoMarcacionTardia.RECHAZADA,
              resueltaEn: resueltaEn.toISOString(),
            },
            // attendanceId e incidentId son null: no existe Attendance asociado
          },
        });

        return rechazada;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  } catch (err) {
    traducirConflicto(err, "rechazar");
  }
}

// ---------------------------------------------------------------------------
// Consulta: obtener marcación tardía por ID
// ---------------------------------------------------------------------------

export async function obtenerMarcacionTardia(
  id: string
): Promise<LateMarcacion | null> {
  return db.lateMarcacion.findUnique({ where: { id } });
}

// ---------------------------------------------------------------------------
// Consulta: listar todas (cualquier estado) para un período
// ---------------------------------------------------------------------------

export async function listarMarcacionesTardiasPorPeriodo(
  weeklyPeriodId: string,
  adminRole: Role
): Promise<LateMarcacion[]> {
  requireAdmin(adminRole);
  return db.lateMarcacion.findMany({
    where: { weeklyPeriodId },
    orderBy: [{ fechaLaboral: "asc" }, { tipo: "asc" }],
  });
}
