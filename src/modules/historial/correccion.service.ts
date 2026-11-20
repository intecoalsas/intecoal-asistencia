// src/modules/historial/correccion.service.ts
/**
 * F6 — Corrección auditada de marcaciones (solo ADMIN).
 *
 * Modelo reutilizado (sin cambios de esquema):
 *  - AttendanceVersion: versiones inmutables (ORIGINAL / CORREGIDO) con la
 *    hora, la puntualidad y una clave de idempotencia única.
 *  - Attendance.currentVersionId: puntero a la versión vigente. El registro
 *    Attendance y sus versiones nunca se borran ni se sobrescriben.
 *  - AttendanceAuditLog (accion CORRECT_ATTENDANCE): valores anteriores y
 *    nuevos, motivo, responsable y fecha; enlazado a la versión creada
 *    (AttendanceVersion.auditLogId), a la marcación y, si aplica, a la incidencia.
 *
 * Flujo en UNA transacción Serializable:
 *  1. ADMIN activo.
 *  2. Concurrencia optimista: el llamador indica la versión que vio
 *     (versionEsperada); si no coincide → CONFLICTO, sin cambios.
 *  3. Validaciones: hora, cambio real, orden cronológico con las demás marcas
 *     del día, incidencia del mismo empleado y fecha.
 *  4. Semana CERRADA → reapertura auditada (reabrirPeriodoEnTx).
 *  5. Si la marcación no tenía versiones: se guarda primero la v1 ORIGINAL
 *     (hora de registro original) para conservarla.
 *  6. Auditoría + nueva versión CORREGIDO + puntero condicional a la nueva versión.
 *  7. Opcional: incidencia vinculada → RESUELTA con resolución y auditoría.
 *  8. Semana CERRADA → nueva versión de cierre (cerrarPeriodoEnTx).
 * Fuera de la transacción: consolidación de la nueva versión (si hubo cierre).
 */
import { createHash } from "crypto";
import {
  Prisma,
  Role,
  EstadoPeriodo,
  EstadoMarcacion,
  PuntualidadEstado,
  TipoMarcacion,
} from "@prisma/client";
import { db } from "@/lib/db";
import { evaluarPuntualidad } from "@/lib/attendance-utils";
import { formatBogota } from "@/lib/date-utils";
import { evaluarDia } from "@/lib/calendario.service";
import { HistorialError } from "./closure.service";
import { reabrirPeriodoEnTx, cerrarPeriodoEnTx, consolidarConRegistro } from "./periodo-tx.service";

const SECUENCIA: TipoMarcacion[] = ["ENTRADA_MANANA", "SALIDA_ALMUERZO", "ENTRADA_ALMUERZO", "SALIDA_JORNADA"];
const ESTADOS_INCIDENCIA_ABIERTA = ["PENDIENTE", "EN_REVISION"] as const;

export interface CorregirMarcacionInput {
  attendanceId: string;
  /** Nueva hora local de Bogotá "HH:mm" en la misma fecha laboral. */
  nuevaHora: unknown;
  motivo: unknown;
  /** Número de la versión vigente que vio el usuario (0 si no tenía versiones). */
  versionEsperada: unknown;
  incidenciaId?: unknown;
  resolverIncidencia?: unknown;
}

export interface CorregirMarcacionResult {
  attendanceId: string;
  versionNumber: number;
  horaAnterior: string;
  horaNueva: string;
  semanaCerrada: boolean;
  nuevoCierreId: string | null;
  incidenciaResuelta: boolean;
}

const sha = (o: unknown) => createHash("sha256").update(JSON.stringify(o)).digest("hex");

function puntualidadDe(
  tipo: TipoMarcacion,
  ts: Date,
  ev: Awaited<ReturnType<typeof evaluarDia>>
): { puntualidad: PuntualidadEstado; minutosDiferencia: number } {
  const hora =
    tipo === "ENTRADA_MANANA" ? ev.dayRule?.horaEntradaManana
    : tipo === "ENTRADA_ALMUERZO" ? ev.dayRule?.horaEntradaAlmuerzo
    : null;
  if (!hora) return { puntualidad: "NO_APLICA", minutosDiferencia: 0 };
  const tol = tipo === "ENTRADA_MANANA" ? ev.toleranciaEntradaMin : ev.toleranciaAlmuerzoMin;
  const r = evaluarPuntualidad(ts, hora, tol, ev.esLaborable);
  if (r.estado === "Tarde") return { puntualidad: "RETARDO", minutosDiferencia: r.minutosRetraso };
  if (r.estado === "Puntual") return { puntualidad: "A_TIEMPO", minutosDiferencia: 0 };
  return { puntualidad: "NO_APLICA", minutosDiferencia: 0 };
}

export async function corregirMarcacion(
  actor: { id: string; role: Role },
  input: CorregirMarcacionInput
): Promise<CorregirMarcacionResult> {
  if (actor.role !== "ADMIN") {
    throw new HistorialError("ROLE_REQUIRED", "Solo un administrador puede corregir marcaciones.");
  }
  if (typeof input.nuevaHora !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.nuevaHora)) {
    throw new HistorialError("MOTIVO_REQUIRED", "La nueva hora debe tener formato HH:mm.");
  }
  const motivo = typeof input.motivo === "string" ? input.motivo.trim() : "";
  if (!motivo) throw new HistorialError("MOTIVO_REQUIRED", "El motivo de la corrección es obligatorio.");
  if (typeof input.versionEsperada !== "number" || !Number.isInteger(input.versionEsperada) || input.versionEsperada < 0) {
    throw new HistorialError("MOTIVO_REQUIRED", "Falta la versión esperada de la marcación.");
  }
  const versionEsperada = input.versionEsperada;
  const incidenciaId = typeof input.incidenciaId === "string" && input.incidenciaId ? input.incidenciaId : null;
  const resolverIncidencia = input.resolverIncidencia === true;
  if (resolverIncidencia && !incidenciaId) {
    throw new HistorialError("MOTIVO_REQUIRED", "Para resolver una incidencia debes seleccionarla.");
  }
  const nuevaHora = input.nuevaHora;

  // Lectura previa (fuera de la transacción) para evaluar puntualidad con el calendario.
  const base = await db.attendance.findUnique({
    where: { id: input.attendanceId },
    select: { userId: true, fechaLaboral: true },
  });
  if (!base) throw new HistorialError("PERIOD_NOT_FOUND", "Marcación no encontrada.");
  const evDia = await evaluarDia(base.userId, base.fechaLaboral);

  let res: CorregirMarcacionResult & { weeklyPeriodId: string | null };
  try {
    res = await db.$transaction(
      async (tx) => {
        // 1. Actor
        const admin = await tx.user.findUnique({ where: { id: actor.id }, select: { role: true, isActive: true } });
        if (!admin || !admin.isActive || admin.role !== "ADMIN") {
          throw new HistorialError("ROLE_REQUIRED", "Solo un administrador activo puede corregir marcaciones.");
        }

        // 2. Marcación y versión vigente
        const att = await tx.attendance.findUnique({
          where: { id: input.attendanceId },
          include: { currentVersion: true },
        });
        if (!att) throw new HistorialError("PERIOD_NOT_FOUND", "Marcación no encontrada.");
        const versionActual = att.currentVersion?.versionNumber ?? 0;
        if (versionActual !== versionEsperada) {
          throw new HistorialError(
            "CONFLICT",
            "La marcación fue modificada por otra operación. Recarga los datos e inténtalo de nuevo."
          );
        }
        const tsActual = att.currentVersion?.timestampUTC ?? att.createdAt;
        const fechaStr = att.fechaLaboral.toISOString().slice(0, 10);
        const tsNuevo = new Date(`${fechaStr}T${nuevaHora}:00-05:00`);
        const horaAnterior = formatBogota(tsActual, "HH:mm");
        if (horaAnterior === nuevaHora) {
          throw new HistorialError("MOTIVO_REQUIRED", "La nueva hora es igual a la hora vigente. No hay cambios que registrar.");
        }

        // 3. Orden cronológico respecto a las demás marcas del día (horas vigentes)
        const delDia = await tx.attendance.findMany({
          where: { userId: att.userId, fechaLaboral: att.fechaLaboral, NOT: { id: att.id } },
          include: { currentVersion: true },
        });
        const idx = SECUENCIA.indexOf(att.tipo);
        for (const o of delDia) {
          const ts = (o.currentVersion?.timestampUTC ?? o.createdAt).getTime();
          const j = SECUENCIA.indexOf(o.tipo);
          if ((j < idx && ts >= tsNuevo.getTime()) || (j > idx && ts <= tsNuevo.getTime())) {
            throw new HistorialError(
              "INVALID_STATE",
              `La nueva hora rompe el orden de las marcaciones del día (${o.tipo} a las ${formatBogota(new Date(ts), "HH:mm")}).`
            );
          }
        }

        // Incidencia vinculada: mismo empleado y fecha
        if (incidenciaId) {
          const inc = await tx.attendanceIncident.findUnique({ where: { id: incidenciaId } });
          if (!inc || inc.userId !== att.userId || inc.fechaLaboral.getTime() !== att.fechaLaboral.getTime()) {
            throw new HistorialError("INVALID_STATE", "La incidencia no corresponde a este empleado y fecha.");
          }
          if (resolverIncidencia && !(ESTADOS_INCIDENCIA_ABIERTA as readonly string[]).includes(inc.estado)) {
            throw new HistorialError("INVALID_STATE", `La incidencia ya fue cerrada (estado: ${inc.estado}).`);
          }
        }

        // 4. Semana de la marcación
        const periodo = await tx.weeklyPeriod.findFirst({
          where: { inicioSemana: { lte: att.fechaLaboral }, finSemana: { gte: att.fechaLaboral } },
        });
        if (periodo?.estado === EstadoPeriodo.PENDIENTE_CIERRE) {
          throw new HistorialError("INVALID_STATE", "La semana se está cerrando. Espera a que termine el cierre e inténtalo de nuevo.");
        }
        const cerrada = periodo?.estado === EstadoPeriodo.CERRADA;
        if (cerrada) {
          await reabrirPeriodoEnTx(tx, periodo.id, actor.id, `Corrección de marcación (Attendance ID: ${att.id}). ${motivo}`);
        }

        // 5. Conservar la versión original si no había versiones
        let numero = versionActual;
        if (!att.currentVersion) {
          const p = puntualidadDe(att.tipo, att.createdAt, evDia);
          const payload = { attendanceId: att.id, tipo: att.tipo, timestampUTC: att.createdAt.toISOString(), estado: "ORIGINAL" };
          await tx.attendanceVersion.create({
            data: {
              attendanceId: att.id, versionNumber: 1, tipo: att.tipo, timestampUTC: att.createdAt,
              estado: EstadoMarcacion.ORIGINAL, puntualidad: p.puntualidad, minutosDiferencia: p.minutosDiferencia,
              esOriginal: true, idempotencyKey: `original:${att.id}`, payloadHash: sha(payload),
            },
          });
          numero = 1;
        }

        // 6. Auditoría + nueva versión + puntero condicional
        const nuevoNumero = numero + 1;
        const log = await tx.attendanceAuditLog.create({
          data: {
            adminId: actor.id,
            accion: "CORRECT_ATTENDANCE",
            motivo,
            attendanceId: att.id,
            incidentId: incidenciaId,
            valoresAnteriores: { attendanceId: att.id, tipo: att.tipo, versionNumber: numero, timestampUTC: tsActual.toISOString(), horaBogota: horaAnterior },
            valoresNuevos: { attendanceId: att.id, tipo: att.tipo, versionNumber: nuevoNumero, timestampUTC: tsNuevo.toISOString(), horaBogota: nuevaHora, semanaCerrada: cerrada },
          },
        });
        const p = puntualidadDe(att.tipo, tsNuevo, evDia);
        const payloadNuevo = { attendanceId: att.id, tipo: att.tipo, timestampUTC: tsNuevo.toISOString(), estado: "CORREGIDO", versionNumber: nuevoNumero };
        const vN = await tx.attendanceVersion.create({
          data: {
            attendanceId: att.id, versionNumber: nuevoNumero, tipo: att.tipo, timestampUTC: tsNuevo,
            estado: EstadoMarcacion.CORREGIDO, puntualidad: p.puntualidad, minutosDiferencia: p.minutosDiferencia,
            esOriginal: false, idempotencyKey: `correccion:${att.id}:v${nuevoNumero}`, payloadHash: sha(payloadNuevo),
            auditLogId: log.id,
          },
        });
        const { count } = await tx.attendance.updateMany({
          where: { id: att.id, currentVersionId: att.currentVersionId },
          data: { currentVersionId: vN.id },
        });
        if (count !== 1) {
          throw new HistorialError("CONFLICT", "La marcación fue modificada por otra operación. Recarga los datos e inténtalo de nuevo.");
        }

        // 7. Resolver la incidencia vinculada (opcional)
        let incidenciaResuelta = false;
        if (incidenciaId && resolverIncidencia) {
          const r = await tx.attendanceIncident.updateMany({
            where: { id: incidenciaId, estado: { in: [...ESTADOS_INCIDENCIA_ABIERTA] } },
            data: { estado: "RESUELTA", resolucion: motivo, resueltoPorId: actor.id, resueltoEn: new Date() },
          });
          if (r.count !== 1) throw new HistorialError("CONFLICT", "La incidencia fue modificada por otra operación.");
          await tx.attendanceAuditLog.create({
            data: {
              adminId: actor.id,
              accion: "UPDATE_INCIDENT_STATE",
              motivo: `Resuelta mediante corrección de marcación (versión ${nuevoNumero}). ${motivo}`,
              incidentId: incidenciaId,
              attendanceId: att.id,
              valoresAnteriores: { estado: "ABIERTA" },
              valoresNuevos: { estado: "RESUELTA", correccionAuditLogId: log.id },
            },
          });
          incidenciaResuelta = true;
        }

        // 8. Nueva versión de cierre si la semana estaba cerrada
        let nuevoCierreId: string | null = null;
        if (cerrada) {
          const cierre = await cerrarPeriodoEnTx(tx, periodo.id, actor.id, `Cierre tras corrección de marcación. ${motivo}`);
          nuevoCierreId = cierre.id;
        }

        return {
          attendanceId: att.id,
          versionNumber: nuevoNumero,
          horaAnterior,
          horaNueva: nuevaHora,
          semanaCerrada: cerrada,
          nuevoCierreId,
          incidenciaResuelta,
          weeklyPeriodId: periodo?.id ?? null,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15_000 }
    );
  } catch (err) {
    if (err instanceof HistorialError) throw err;
    const e = err as { code?: string; message?: string };
    if (e.code === "P2002") {
      throw new HistorialError("CONFLICT", "Otra corrección de esta marcación se registró al mismo tiempo. Recarga e inténtalo de nuevo.");
    }
    if (e.code === "P2034" || e.code === "P2028" || (e.message ?? "").includes("deadlock") || (e.message ?? "").includes("Lock wait timeout")) {
      throw new HistorialError("CONFLICT", "Conflicto de concurrencia al corregir la marcación. Inténtalo de nuevo.");
    }
    throw err;
  }

  if (res.nuevoCierreId && res.weeklyPeriodId) {
    await consolidarConRegistro(res.nuevoCierreId, res.weeklyPeriodId, "corrección de marcación");
  }

  const { weeklyPeriodId: _omit, ...publico } = res;
  void _omit;
  return publico;
}

/** Historial de versiones y auditoría de una marcación (ADMIN y SUPERVISOR). */
export async function obtenerHistorialMarcacion(attendanceId: string) {
  const att = await db.attendance.findUnique({
    where: { id: attendanceId },
    select: {
      id: true, tipo: true, fechaLaboral: true, createdAt: true, currentVersionId: true,
      user: { select: { nombre: true, apellido: true, documento: true } },
      versions: {
        orderBy: { versionNumber: "asc" },
        select: {
          id: true, versionNumber: true, timestampUTC: true, estado: true, puntualidad: true,
          minutosDiferencia: true, esOriginal: true, createdAt: true,
          auditLog: { select: { motivo: true, createdAt: true, incidentId: true, admin: { select: { nombre: true, apellido: true } } } },
        },
      },
    },
  });
  if (!att) throw new HistorialError("PERIOD_NOT_FOUND", "Marcación no encontrada.");
  return att;
}
