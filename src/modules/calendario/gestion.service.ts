// src/modules/calendario/gestion.service.ts
/**
 * F5b — Gestión de festivos (DiaNoLaborable) y novedades (NovedadEmpleado).
 *
 * Reglas:
 *  - Festivos: solo ADMIN. Fecha única. No se eliminan: solo se activan/desactivan.
 *  - Novedades: ADMIN y SUPERVISOR registran (siempre PENDIENTE) para empleados
 *    activos. Solo ADMIN decide (AUTORIZADA/RECHAZADA), únicamente desde
 *    PENDIENTE, con motivo. No se editan ni eliminan.
 *  - Autorizar: valida fechas y que no se solape con otra novedad AUTORIZADA
 *    del mismo empleado, en transacción Serializable con actualización
 *    condicional del estado (WHERE estado = PENDIENTE).
 *  - Las decisiones no recalculan semanas cerradas: se informa qué cierres
 *    históricos cubre la novedad para que se aplique reapertura + nuevo cierre.
 *
 * El actor (registradaPorId / resueltaPorId / creadoPorId / adminId de
 * auditoría) siempre proviene de la sesión, nunca del cliente.
 */
import { Prisma, Role, TipoNovedad, EstadoNovedad } from "@prisma/client";
import { db } from "@/lib/db";

export type GestionErrorCode =
  | "DATOS_INVALIDOS"
  | "NO_ENCONTRADO"
  | "DUPLICADO"
  | "ESTADO_INVALIDO"
  | "SOLAPAMIENTO"
  | "PERMISO"
  | "CONFLICTO";

export class GestionCalendarioError extends Error {
  constructor(public readonly code: GestionErrorCode, message: string) {
    super(message);
    this.name = "GestionCalendarioError";
  }
}

export const HTTP_POR_CODIGO: Record<GestionErrorCode, number> = {
  DATOS_INVALIDOS: 400,
  PERMISO: 403,
  NO_ENCONTRADO: 404,
  DUPLICADO: 409,
  ESTADO_INVALIDO: 409,
  SOLAPAMIENTO: 409,
  CONFLICTO: 409,
};

export const TIPOS_NOVEDAD = Object.values(TipoNovedad);
export const ESTADOS_NOVEDAD = Object.values(EstadoNovedad);

interface Actor {
  id: string;
  role: Role;
}

/** Convierte "YYYY-MM-DD" a fecha laboral (medianoche UTC) o lanza DATOS_INVALIDOS. */
export function parseFecha(valor: unknown, campo: string): Date {
  if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    throw new GestionCalendarioError("DATOS_INVALIDOS", `El campo '${campo}' debe tener formato AAAA-MM-DD.`);
  }
  const d = new Date(`${valor}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== valor) {
    throw new GestionCalendarioError("DATOS_INVALIDOS", `El campo '${campo}' no es una fecha válida.`);
  }
  return d;
}

function esConflictoConcurrencia(err: unknown): boolean {
  const e = err as { code?: string; message?: string };
  return (
    e.code === "P2034" ||
    e.code === "P2028" ||
    (e.message ?? "").includes("deadlock") ||
    (e.message ?? "").includes("Lock wait timeout")
  );
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// Festivos
// ---------------------------------------------------------------------------

export async function listarFestivos() {
  return db.diaNoLaborable.findMany({
    orderBy: { fecha: "desc" },
    include: { creadoPor: { select: { nombre: true, apellido: true } } },
  });
}

export async function crearFestivo(actor: Actor, input: { fecha?: unknown; descripcion?: unknown }) {
  const fecha = parseFecha(input.fecha, "fecha");
  const descripcion = typeof input.descripcion === "string" ? input.descripcion.trim() : "";
  if (!descripcion) throw new GestionCalendarioError("DATOS_INVALIDOS", "La descripción es obligatoria.");
  if (descripcion.length > 191) throw new GestionCalendarioError("DATOS_INVALIDOS", "La descripción supera los 191 caracteres.");

  try {
    return await db.$transaction(async (tx) => {
      const festivo = await tx.diaNoLaborable.create({
        data: { fecha, descripcion, creadoPorId: actor.id },
      });
      await tx.attendanceAuditLog.create({
        data: {
          adminId: actor.id,
          accion: "CREATE_DIA_NO_LABORABLE",
          motivo: `Festivo registrado: ${descripcion}`,
          valoresAnteriores: {},
          valoresNuevos: { diaNoLaborableId: festivo.id, fecha: iso(fecha), descripcion, isActive: true },
        },
      });
      return festivo;
    });
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") {
      throw new GestionCalendarioError("DUPLICADO", `Ya existe un festivo registrado para el ${iso(fecha)}.`);
    }
    throw err;
  }
}

export async function cambiarEstadoFestivo(actor: Actor, id: string, input: { isActive?: unknown; motivo?: unknown }) {
  if (typeof input.isActive !== "boolean") {
    throw new GestionCalendarioError("DATOS_INVALIDOS", "El campo 'isActive' debe ser verdadero o falso.");
  }
  const motivo = typeof input.motivo === "string" ? input.motivo.trim() : "";
  if (!motivo) throw new GestionCalendarioError("DATOS_INVALIDOS", "El motivo es obligatorio.");
  const nuevoEstado = input.isActive;

  return db.$transaction(async (tx) => {
    const { count } = await tx.diaNoLaborable.updateMany({
      where: { id, isActive: !nuevoEstado },
      data: { isActive: nuevoEstado },
    });
    if (count === 0) {
      const existe = await tx.diaNoLaborable.findUnique({ where: { id }, select: { isActive: true } });
      if (!existe) throw new GestionCalendarioError("NO_ENCONTRADO", "Festivo no encontrado.");
      throw new GestionCalendarioError("ESTADO_INVALIDO", `El festivo ya está ${existe.isActive ? "activo" : "inactivo"}.`);
    }
    const festivo = await tx.diaNoLaborable.findUniqueOrThrow({ where: { id } });
    await tx.attendanceAuditLog.create({
      data: {
        adminId: actor.id,
        accion: nuevoEstado ? "ACTIVATE_DIA_NO_LABORABLE" : "DEACTIVATE_DIA_NO_LABORABLE",
        motivo,
        valoresAnteriores: { diaNoLaborableId: id, isActive: !nuevoEstado },
        valoresNuevos: { diaNoLaborableId: id, isActive: nuevoEstado },
      },
    });
    return festivo;
  });
}

// ---------------------------------------------------------------------------
// Novedades
// ---------------------------------------------------------------------------

const includeNovedad = {
  user: { select: { id: true, nombre: true, apellido: true, documento: true } },
  registradaPor: { select: { nombre: true, apellido: true } },
  resueltaPor: { select: { nombre: true, apellido: true } },
} satisfies Prisma.NovedadEmpleadoInclude;

export interface FiltrosNovedades {
  userId?: string | null;
  tipo?: string | null;
  estado?: string | null;
  desde?: string | null;
  hasta?: string | null;
}

export async function listarNovedades(f: FiltrosNovedades) {
  const where: Prisma.NovedadEmpleadoWhereInput = {};
  if (f.userId) where.userId = f.userId;
  if (f.tipo) {
    if (!TIPOS_NOVEDAD.includes(f.tipo as TipoNovedad)) throw new GestionCalendarioError("DATOS_INVALIDOS", "Tipo de novedad no válido.");
    where.tipo = f.tipo as TipoNovedad;
  }
  if (f.estado) {
    if (!ESTADOS_NOVEDAD.includes(f.estado as EstadoNovedad)) throw new GestionCalendarioError("DATOS_INVALIDOS", "Estado de novedad no válido.");
    where.estado = f.estado as EstadoNovedad;
  }
  // Filtro por rango: novedades que intersectan [desde, hasta]
  if (f.desde) where.fechaFin = { gte: parseFecha(f.desde, "desde") };
  if (f.hasta) where.fechaInicio = { lte: parseFecha(f.hasta, "hasta") };

  return db.novedadEmpleado.findMany({
    where,
    include: includeNovedad,
    orderBy: [{ fechaInicio: "desc" }, { createdAt: "desc" }],
    take: 500,
  });
}

export async function registrarNovedad(
  actor: Actor,
  input: { userId: unknown; tipo: unknown; fechaInicio: unknown; fechaFin: unknown; motivo: unknown }
) {
  if (typeof input.userId !== "string" || !input.userId) {
    throw new GestionCalendarioError("DATOS_INVALIDOS", "Selecciona el empleado.");
  }
  if (typeof input.tipo !== "string" || !TIPOS_NOVEDAD.includes(input.tipo as TipoNovedad)) {
    throw new GestionCalendarioError("DATOS_INVALIDOS", `Tipo de novedad no válido. Valores permitidos: ${TIPOS_NOVEDAD.join(", ")}.`);
  }
  const fechaInicio = parseFecha(input.fechaInicio, "fechaInicio");
  const fechaFin = parseFecha(input.fechaFin, "fechaFin");
  if (fechaFin.getTime() < fechaInicio.getTime()) {
    throw new GestionCalendarioError("DATOS_INVALIDOS", "La fecha final no puede ser anterior a la fecha inicial.");
  }
  const motivo = typeof input.motivo === "string" ? input.motivo.trim() : "";
  if (!motivo) throw new GestionCalendarioError("DATOS_INVALIDOS", "El motivo es obligatorio.");

  const empleado = await db.user.findUnique({ where: { id: input.userId }, select: { id: true, isActive: true, role: true } });
  if (!empleado || empleado.role !== "EMPLEADO") {
    throw new GestionCalendarioError("NO_ENCONTRADO", "Empleado no encontrado.");
  }
  if (!empleado.isActive) {
    throw new GestionCalendarioError("DATOS_INVALIDOS", "Solo se pueden registrar novedades para empleados activos.");
  }

  return db.$transaction(async (tx) => {
    const novedad = await tx.novedadEmpleado.create({
      data: {
        userId: empleado.id,
        tipo: input.tipo as TipoNovedad,
        fechaInicio,
        fechaFin,
        motivo,
        estado: "PENDIENTE",
        registradaPorId: actor.id,
      },
      include: includeNovedad,
    });
    await tx.attendanceAuditLog.create({
      data: {
        adminId: actor.id,
        accion: "CREATE_NOVEDAD",
        motivo,
        valoresAnteriores: {},
        valoresNuevos: {
          novedadId: novedad.id, userId: empleado.id, tipo: novedad.tipo,
          fechaInicio: iso(fechaInicio), fechaFin: iso(fechaFin), estado: "PENDIENTE",
        },
      },
    });
    return novedad;
  });
}

/**
 * Autoriza o rechaza una novedad PENDIENTE (solo ADMIN).
 * Devuelve la novedad actualizada y los cierres históricos que cubren su rango.
 */
export async function decidirNovedad(
  actor: Actor,
  id: string,
  input: { decision?: unknown; motivo?: unknown }
) {
  if (actor.role !== "ADMIN") {
    throw new GestionCalendarioError("PERMISO", "Solo un administrador puede autorizar o rechazar novedades.");
  }
  if (input.decision !== "AUTORIZAR" && input.decision !== "RECHAZAR") {
    throw new GestionCalendarioError("DATOS_INVALIDOS", "La decisión debe ser AUTORIZAR o RECHAZAR.");
  }
  const motivo = typeof input.motivo === "string" ? input.motivo.trim() : "";
  if (!motivo) throw new GestionCalendarioError("DATOS_INVALIDOS", "El motivo de la decisión es obligatorio.");
  const nuevoEstado: EstadoNovedad = input.decision === "AUTORIZAR" ? "AUTORIZADA" : "RECHAZADA";

  try {
    const novedad = await db.$transaction(
      async (tx) => {
        const actual = await tx.novedadEmpleado.findUnique({ where: { id } });
        if (!actual) throw new GestionCalendarioError("NO_ENCONTRADO", "Novedad no encontrada.");
        if (actual.estado !== "PENDIENTE") {
          throw new GestionCalendarioError("ESTADO_INVALIDO", `La novedad ya fue decidida (estado: ${actual.estado}). No se puede modificar.`);
        }

        if (nuevoEstado === "AUTORIZADA") {
          if (actual.fechaFin.getTime() < actual.fechaInicio.getTime()) {
            throw new GestionCalendarioError("DATOS_INVALIDOS", "La novedad tiene fechas inválidas: la fecha final es anterior a la inicial.");
          }
          const solapada = await tx.novedadEmpleado.findFirst({
            where: {
              userId: actual.userId,
              estado: "AUTORIZADA",
              id: { not: actual.id },
              fechaInicio: { lte: actual.fechaFin },
              fechaFin: { gte: actual.fechaInicio },
            },
            select: { fechaInicio: true, fechaFin: true, tipo: true },
          });
          if (solapada) {
            throw new GestionCalendarioError(
              "SOLAPAMIENTO",
              `Se solapa con otra novedad autorizada del empleado (${solapada.tipo}, ${iso(solapada.fechaInicio)} a ${iso(solapada.fechaFin)}).`
            );
          }
        }

        const resueltaEn = new Date();
        const { count } = await tx.novedadEmpleado.updateMany({
          where: { id, estado: "PENDIENTE" },
          data: { estado: nuevoEstado, resueltaPorId: actor.id, resueltaEn, motivoDecision: motivo },
        });
        if (count === 0) {
          throw new GestionCalendarioError("ESTADO_INVALIDO", "La novedad ya fue decidida por otra operación.");
        }

        await tx.attendanceAuditLog.create({
          data: {
            adminId: actor.id,
            accion: nuevoEstado === "AUTORIZADA" ? "AUTHORIZE_NOVEDAD" : "REJECT_NOVEDAD",
            motivo,
            valoresAnteriores: { novedadId: id, estado: "PENDIENTE" },
            valoresNuevos: { novedadId: id, estado: nuevoEstado, resueltaEn: resueltaEn.toISOString() },
          },
        });

        return tx.novedadEmpleado.findUniqueOrThrow({ where: { id }, include: includeNovedad });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000 }
    );

    // Cierres históricos que cubren el rango (no se recalculan automáticamente)
    const semanasCerradas = nuevoEstado === "AUTORIZADA"
      ? await db.weeklyPeriod.findMany({
          where: {
            estado: "CERRADA",
            inicioSemana: { lte: novedad.fechaFin },
            finSemana: { gte: novedad.fechaInicio },
          },
          select: { inicioSemana: true, finSemana: true },
          orderBy: { inicioSemana: "asc" },
        })
      : [];

    return {
      novedad,
      semanasCerradas: semanasCerradas.map((s) => ({ inicio: iso(s.inicioSemana), fin: iso(s.finSemana) })),
    };
  } catch (err) {
    if (err instanceof GestionCalendarioError) throw err;
    if (esConflictoConcurrencia(err)) {
      throw new GestionCalendarioError("CONFLICTO", "Otra operación modificó las novedades al mismo tiempo. Intenta de nuevo.");
    }
    throw err;
  }
}

/** Respuesta HTTP homogénea para errores del módulo. */
export function respuestaError(err: unknown, contexto: string) {
  if (err instanceof GestionCalendarioError) {
    return { status: HTTP_POR_CODIGO[err.code], body: { error: err.message, code: err.code } };
  }
  console.error(`[${contexto}] Error:`, err);
  return { status: 500, body: { error: "Error interno. Intenta nuevamente." } };
}
