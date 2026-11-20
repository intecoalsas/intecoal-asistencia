// src/app/api/incidencias/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { TipoIncidencia, EstadoIncidencia } from "@prisma/client";

/** GET /api/incidencias – list incidents according to role */
export const GET = requireAuth(async (_req, user) => {
  const { role, id: userId } = user;

  // ADMIN and SUPERVISOR see all incidents; EMPLEADO sees only their own
  const whereClause: { userId?: string } =
    role === "EMPLEADO" ? { userId } : {};

  const incidents = await db.attendanceIncident.findMany({
    where: whereClause,
    include: {
      user: true,
      auditLogs: {
        where: { accion: "CREATE_INCIDENT" },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { valoresNuevos: true },
      },
    },
    orderBy: { fechaLaboral: "desc" },
  });

  const payload = incidents.map((inc) => {
    // Safely extract prioridad from the Json field
    const audit = inc.auditLogs[0];
    const valoresNuevos =
      audit?.valoresNuevos &&
      typeof audit.valoresNuevos === "object" &&
      !Array.isArray(audit.valoresNuevos)
        ? (audit.valoresNuevos as Record<string, unknown>)
        : null;
    const prioridad =
      valoresNuevos && typeof valoresNuevos.prioridad === "string"
        ? valoresNuevos.prioridad
        : null;

    return {
      id: inc.id,
      name: `${inc.user?.nombre ?? ""} ${inc.user?.apellido ?? ""}`.trim(),
      documento: inc.user?.documento ?? "",
      tipo: inc.tipo as string,
      fecha: inc.fechaLaboral.toISOString().split("T")[0],
      descripcion: inc.descripcion,
      prioridad,
      estado: inc.estado as string,
      resolvedBy: inc.resueltoPorId ?? null,
    };
  });

  return NextResponse.json({ incidents: payload, role, userId });
}, ["ADMIN", "SUPERVISOR", "EMPLEADO"]);

/** POST /api/incidencias – create a new incident */
export const POST = requireAuth(async (req, user) => {
  const body = await req.json();
  const {
    tipo,
    descripcion,
    prioridad,
    fechaLaboral,
    userId: targetUserId,
  } = body as {
    tipo?: string;
    descripcion?: string;
    prioridad?: string;
    fechaLaboral?: string;
    userId?: string;
  };

  // Validate required fields
  if (!tipo || !descripcion) {
    return NextResponse.json(
      { error: "Campos obligatorios faltantes: tipo y descripcion" },
      { status: 400 }
    );
  }

  // Validate TipoIncidencia enum
  const allowedTipos: string[] = Object.values(TipoIncidencia);
  if (!allowedTipos.includes(tipo)) {
    return NextResponse.json(
      {
        error: `Tipo de incidencia no válido. Valores permitidos: ${allowedTipos.join(", ")}`,
      },
      { status: 400 }
    );
  }

  // Determine the incident owner
  let incidentUserId: string;

  if (user.role === "EMPLEADO") {
    // EMPLEADO can only create for themselves
    if (targetUserId && targetUserId !== user.id) {
      return NextResponse.json(
        { error: "No tienes permiso para crear incidencias para otro usuario" },
        { status: 403 }
      );
    }
    incidentUserId = user.id;
  } else {
    // ADMIN and SUPERVISOR: must provide a targetUserId
    if (!targetUserId) {
      return NextResponse.json(
        { error: "Debes especificar el empleado (userId) para la incidencia" },
        { status: 400 }
      );
    }
    incidentUserId = targetUserId;
  }

  // Verify target user exists
  const targetUser = await db.user.findUnique({
    where: { id: incidentUserId },
    select: { id: true, nombre: true, apellido: true, documento: true, isActive: true, role: true },
  });

  if (!targetUser) {
    return NextResponse.json(
      { error: "Usuario destino no encontrado" },
      { status: 404 }
    );
  }

  // ADMIN and SUPERVISOR: enforce active + role EMPLEADO
  if (user.role === "ADMIN" || user.role === "SUPERVISOR") {
    if (!targetUser.isActive) {
      return NextResponse.json(
        { error: "El empleado seleccionado no está activo" },
        { status: 400 }
      );
    }
    if (targetUser.role !== "EMPLEADO") {
      return NextResponse.json(
        { error: "Solo se pueden crear incidencias para empleados" },
        { status: 400 }
      );
    }
  }

  const fecha = fechaLaboral ? new Date(fechaLaboral) : new Date();

  // Atomic transaction: create incident first, then audit log with the real incidentId
  const incident = await db.$transaction(async (tx) => {
    const inc = await tx.attendanceIncident.create({
      data: {
        userId: incidentUserId,
        tipo: tipo as TipoIncidencia,
        descripcion,
        fechaLaboral: fecha,
      },
    });

    await tx.attendanceAuditLog.create({
      data: {
        adminId: user.id,
        accion: "CREATE_INCIDENT",
        motivo: "Creación de incidencia",
        valoresAnteriores: {},
        valoresNuevos: {
          tipo,
          descripcion,
          prioridad: prioridad ?? null,
          fechaLaboral: fecha.toISOString(),
          userId: incidentUserId,
        },
        incidentId: inc.id,
      },
    });

    return inc;
  });

  return NextResponse.json(
    {
      id: incident.id,
      name: `${targetUser.nombre ?? ""} ${targetUser.apellido ?? ""}`.trim(),
      documento: targetUser.documento ?? "",
      tipo: incident.tipo as string,
      fecha: incident.fechaLaboral.toISOString().split("T")[0],
      descripcion: incident.descripcion,
      prioridad: prioridad ?? null,
      estado: incident.estado as string,
    },
    { status: 201 }
  );
}, ["ADMIN", "SUPERVISOR", "EMPLEADO"]);
