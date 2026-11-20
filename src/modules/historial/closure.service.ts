/**
 * Módulo Historial — Servicio de Cierres y Reaperturas
 *
 * Responsabilidades:
 *  - cerrarPeriodo: cierra un WeeklyPeriod, creando un WeeklyClosure versionado.
 *  - reabrirPeriodo: reabre un período CERRADO (solo ADMIN), registrando en AttendanceAuditLog.
 *  - obtenerCierreVigente: devuelve el último WeeklyClosure exitoso de un período.
 *  - esPeriodoCerrado: comprueba si el período está en estado CERRADA.
 *
 * Concurrencia:
 *  Todas las operaciones que modifican estado usan db.$transaction con
 *  isolationLevel: "Serializable". Esto garantiza en MySQL (InnoDB) que dos
 *  transacciones concurrentes no lean/escriban el mismo período simultáneamente
 *  sin detectar el conflicto. Si hay colisión, MySQL lanza un deadlock/serialization
 *  error que se propaga como HistorialError con código CONFLICT para que el
 *  llamador pueda reintentar o informar al usuario.
 *
 * Versionado:
 *  Dentro de la transacción se obtiene el MAX(version) actual con un SELECT
 *  que forma parte del mismo snapshot serializable, por lo que nunca dos
 *  transacciones concurrentes pueden calcular el mismo número de versión siguiente.
 *
 * Auditoría de reaperturas:
 *  Se registra en AttendanceAuditLog siguiendo exactamente el mismo patrón
 *  que el resto del sistema (ver src/app/api/incidencias/[id]/route.ts).
 *  La reapertura NO crea un WeeklyClosure (corrección A del diseño).
 */

import {
  WeeklyClosure,
  WeeklyPeriod,
  EstadoPeriodo,
  TipoCierre,
  Prisma,
} from "@prisma/client";
import { db } from "@/lib/db";

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export interface CerrarPeriodoInput {
  weeklyPeriodId: string;
  tipo: TipoCierre;
  /** Null para cierres automáticos (scheduler). UUID del user para cierres manuales. */
  actorId: string | null;
  /** Motivo opcional (obligatorio en MANUAL_ADMIN tras reapertura, recomendado). */
  motivo?: string;
  /** Momento del cierre. Si se omite, se usa new Date(). */
  cerradoEn?: Date;
}

export interface ReabrirPeriodoInput {
  weeklyPeriodId: string;
  /** UUID del ADMIN que autoriza la reapertura. */
  adminId: string;
  /** Motivo obligatorio. */
  motivo: string;
  /** IP del actor (para auditoría). */
  ipAddress?: string;
  /** User-Agent del actor (para auditoría). */
  userAgent?: string;
}

export interface CerrarPeriodoResult {
  periodo: WeeklyPeriod;
  cierre: WeeklyClosure;
}

/** Códigos de error propios del módulo historial. */
export type HistorialErrorCode =
  | "PERIOD_NOT_FOUND"
  | "INVALID_STATE"
  | "ROLE_REQUIRED"
  | "MOTIVO_REQUIRED"
  | "CONFLICT";

export class HistorialError extends Error {
  constructor(
    public readonly code: HistorialErrorCode,
    message: string
  ) {
    super(message);
    this.name = "HistorialError";
  }
}

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

/** Estados desde los que se permite iniciar un cierre. */
const ESTADOS_CERRABLES: EstadoPeriodo[] = [
  EstadoPeriodo.ABIERTA,
  EstadoPeriodo.PENDIENTE_CIERRE,
  EstadoPeriodo.REABIERTA,
];

// ---------------------------------------------------------------------------
// Operación: cerrar período
// ---------------------------------------------------------------------------

/**
 * Cierra un período semanal creando un WeeklyClosure versionado.
 *
 * Precondiciones (verificadas dentro de la transacción):
 *  - El período existe.
 *  - El período está en estado ABIERTA, PENDIENTE_CIERRE o REABIERTA.
 *
 * Postcondiciones:
 *  - Se crea un WeeklyClosure con version = MAX(version previo) + 1.
 *  - exitoso = true.
 *  - El período pasa a CERRADA.
 *  - Los WeeklyClosure anteriores permanecen intactos.
 *
 * Concurrencia: transacción Serializable. Si dos peticiones compiten,
 * la segunda falla con HistorialError(CONFLICT) y debe reintentarse.
 */
export async function cerrarPeriodo(
  input: CerrarPeriodoInput
): Promise<CerrarPeriodoResult> {
  const cerradoEn = input.cerradoEn ?? new Date();

  try {
    return await db.$transaction(
      async (tx) => {
        // 1. Leer el período con bloqueo (dentro del snapshot serializable)
        const periodo = await tx.weeklyPeriod.findUnique({
          where: { id: input.weeklyPeriodId },
        });

        if (!periodo) {
          throw new HistorialError(
            "PERIOD_NOT_FOUND",
            `Período ${input.weeklyPeriodId} no encontrado.`
          );
        }

        if (!ESTADOS_CERRABLES.includes(periodo.estado)) {
          throw new HistorialError(
            "INVALID_STATE",
            `No se puede cerrar un período en estado ${periodo.estado}. ` +
              `Estados válidos: ${ESTADOS_CERRABLES.join(", ")}.`
          );
        }

        // 2. Calcular la siguiente versión (MAX actual + 1)
        //    Se ejecuta dentro de la misma transacción serializable,
        //    por lo que dos cierres concurrentes no pueden obtener el mismo número.
        const maxVersionResult = await tx.weeklyClosure.aggregate({
          where: { weeklyPeriodId: input.weeklyPeriodId },
          _max: { version: true },
        });
        const nextVersion = (maxVersionResult._max.version ?? 0) + 1;

        // 3. Crear el WeeklyClosure
        const cierre = await tx.weeklyClosure.create({
          data: {
            weeklyPeriodId: input.weeklyPeriodId,
            version: nextVersion,
            tipo: input.tipo,
            exitoso: true,
            actorId: input.actorId,
            motivo: input.motivo ?? null,
            cerradoEn,
          },
        });

        // 4. Actualizar el estado del período a CERRADA
        const periodoActualizado = await tx.weeklyPeriod.update({
          where: { id: input.weeklyPeriodId },
          data: { estado: EstadoPeriodo.CERRADA },
        });

        return { periodo: periodoActualizado, cierre };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  } catch (err) {
    // Re-lanzar errores propios del módulo sin envolver
    if (err instanceof HistorialError) throw err;
    // Colisión de serialización MySQL (error 1213) o deadlock
    const mysqlErr = err as { code?: string; message?: string };
    if (
      mysqlErr.code === "P2034" ||
      mysqlErr.message?.includes("deadlock") ||
      mysqlErr.message?.includes("serialize")
    ) {
      throw new HistorialError(
        "CONFLICT",
        "Conflicto de concurrencia al cerrar el período. Reintente la operación."
      );
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Operación: reabrir período
// ---------------------------------------------------------------------------

/**
 * Reabre un período en estado CERRADA.
 *
 * Precondiciones (verificadas dentro de la transacción):
 *  - El período existe.
 *  - El período está en estado CERRADA.
 *  - El adminId pertenece a un usuario con rol ADMIN activo.
 *  - El motivo no está vacío.
 *
 * Postcondiciones:
 *  - El período pasa a REABIERTA.
 *  - Se registra un AttendanceAuditLog con acción REOPEN_WEEKLY_PERIOD.
 *  - Los WeeklyClosure anteriores permanecen intactos (append-only).
 *  - NO se crea ningún WeeklyClosure para representar la reapertura.
 *
 * Concurrencia: transacción Serializable. Garantiza que dos solicitudes
 * simultáneas de reapertura no ambas lean CERRADA y ambas procedan.
 */
export async function reabrirPeriodo(
  input: ReabrirPeriodoInput
): Promise<WeeklyPeriod> {
  if (!input.motivo?.trim()) {
    throw new HistorialError(
      "MOTIVO_REQUIRED",
      "El motivo de reapertura es obligatorio."
    );
  }

  try {
    return await db.$transaction(
      async (tx) => {
        // 1. Verificar que el actor es ADMIN activo (verificación en servidor)
        const admin = await tx.user.findUnique({
          where: { id: input.adminId },
          select: { id: true, role: true, isActive: true },
        });

        if (!admin || !admin.isActive || admin.role !== "ADMIN") {
          throw new HistorialError(
            "ROLE_REQUIRED",
            "Solo un ADMIN activo puede reabrir un período cerrado."
          );
        }

        // 2. Leer el período dentro de la transacción serializable
        const periodo = await tx.weeklyPeriod.findUnique({
          where: { id: input.weeklyPeriodId },
        });

        if (!periodo) {
          throw new HistorialError(
            "PERIOD_NOT_FOUND",
            `Período ${input.weeklyPeriodId} no encontrado.`
          );
        }

        if (periodo.estado !== EstadoPeriodo.CERRADA) {
          throw new HistorialError(
            "INVALID_STATE",
            `Solo se puede reabrir un período CERRADA. Estado actual: ${periodo.estado}.`
          );
        }

        // 3. Actualizar el estado a REABIERTA
        const periodoActualizado = await tx.weeklyPeriod.update({
          where: { id: input.weeklyPeriodId },
          data: { estado: EstadoPeriodo.REABIERTA },
        });

        // 4. Registrar en AttendanceAuditLog (mismo patrón que el resto del sistema)
        await tx.attendanceAuditLog.create({
          data: {
            adminId: input.adminId,
            accion: "REOPEN_WEEKLY_PERIOD",
            motivo: input.motivo.trim(),
            valoresAnteriores: {
              weeklyPeriodId: input.weeklyPeriodId,
              estado: EstadoPeriodo.CERRADA,
            },
            valoresNuevos: {
              weeklyPeriodId: input.weeklyPeriodId,
              estado: EstadoPeriodo.REABIERTA,
            },
            ipAddress: input.ipAddress ?? null,
            userAgent: input.userAgent ?? null,
            // attendanceId e incidentId son null: la auditoría es de período, no de marcación
          },
        });

        return periodoActualizado;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  } catch (err) {
    if (err instanceof HistorialError) throw err;
    const mysqlErr = err as { code?: string; message?: string };
    if (
      mysqlErr.code === "P2034" ||
      mysqlErr.message?.includes("deadlock") ||
      mysqlErr.message?.includes("serialize")
    ) {
      throw new HistorialError(
        "CONFLICT",
        "Conflicto de concurrencia al reabrir el período. Reintente la operación."
      );
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Consultas de solo lectura
// ---------------------------------------------------------------------------

/**
 * Devuelve el último WeeklyClosure exitoso de un período (la versión vigente).
 * Devuelve null si el período nunca fue cerrado exitosamente.
 */
export async function obtenerCierreVigente(
  weeklyPeriodId: string
): Promise<WeeklyClosure | null> {
  return db.weeklyClosure.findFirst({
    where: { weeklyPeriodId, exitoso: true },
    orderBy: { version: "desc" },
  });
}

/**
 * Devuelve todos los cierres exitosos de un período, ordenados de más antiguo a más reciente.
 */
export async function listarCierres(
  weeklyPeriodId: string
): Promise<WeeklyClosure[]> {
  return db.weeklyClosure.findMany({
    where: { weeklyPeriodId, exitoso: true },
    orderBy: { version: "asc" },
  });
}

/**
 * Devuelve true si el período está en estado CERRADA.
 * Acepta un WeeklyPeriod ya cargado o un ID para buscarlo.
 */
export async function esPeriodoCerrado(
  periodoOrId: WeeklyPeriod | string
): Promise<boolean> {
  if (typeof periodoOrId === "string") {
    const p = await db.weeklyPeriod.findUnique({
      where: { id: periodoOrId },
      select: { estado: true },
    });
    return p?.estado === EstadoPeriodo.CERRADA;
  }
  return periodoOrId.estado === EstadoPeriodo.CERRADA;
}

/**
 * Devuelve true si el período está en un estado que permite modificaciones
 * (ABIERTA o REABIERTA). En CERRADA o PENDIENTE_CIERRE las modificaciones
 * históricas están bloqueadas.
 */
export function permiteModificaciones(periodo: WeeklyPeriod): boolean {
  return (
    periodo.estado === EstadoPeriodo.ABIERTA ||
    periodo.estado === EstadoPeriodo.REABIERTA
  );
}
