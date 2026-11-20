// src/app/api/incidencias/[id]/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { EstadoIncidencia } from "@prisma/client";

/** PATCH /api/incidencias/:id – change the state of an incident (ADMIN only) */
export const PATCH = requireAuth(async (req, user) => {
  // Robust ID extraction: avoids query-string contamination
  const incidentId = new URL(req.url).pathname.split("/").pop() ?? "";

  if (!incidentId) {
    return NextResponse.json(
      { error: "ID de incidencia requerido" },
      { status: 400 }
    );
  }

  const body = await req.json();
  const { estado: newEstado } = body as { estado?: string };

  if (!newEstado) {
    return NextResponse.json(
      { error: "El campo 'estado' es requerido" },
      { status: 400 }
    );
  }

  // Validate EstadoIncidencia enum
  const allowedEstados: string[] = Object.values(EstadoIncidencia);
  if (!allowedEstados.includes(newEstado)) {
    return NextResponse.json(
      {
        error: `Estado no válido. Valores permitidos: ${allowedEstados.join(", ")}`,
      },
      { status: 400 }
    );
  }

  // Check incident exists
  const incident = await db.attendanceIncident.findUnique({
    where: { id: incidentId },
  });

  if (!incident) {
    return NextResponse.json(
      { error: "Incidencia no encontrada" },
      { status: 404 }
    );
  }

  const previousEstado = incident.estado;

  // Atomic transaction: update incident + create audit log
  const updated = await db.$transaction(async (tx) => {
    const inc = await tx.attendanceIncident.update({
      where: { id: incidentId },
      data: {
        estado: newEstado as EstadoIncidencia,
        resueltoPorId:
          newEstado === EstadoIncidencia.RESUELTA ||
          newEstado === EstadoIncidencia.RECHAZADA ||
          newEstado === EstadoIncidencia.JUSTIFICADA
            ? user.id
            : incident.resueltoPorId,
        resueltoEn:
          newEstado === EstadoIncidencia.RESUELTA ||
          newEstado === EstadoIncidencia.RECHAZADA ||
          newEstado === EstadoIncidencia.JUSTIFICADA
            ? new Date()
            : incident.resueltoEn,
      },
    });

    await tx.attendanceAuditLog.create({
      data: {
        adminId: user.id,
        accion: "UPDATE_INCIDENT_STATE",
        motivo: `Cambio de estado de ${previousEstado} a ${newEstado}`,
        valoresAnteriores: { estado: previousEstado },
        valoresNuevos: { estado: newEstado },
        incidentId: inc.id,
      },
    });

    return inc;
  });

  // Retrieve associated user
  const targetUser = await db.user.findUnique({
    where: { id: updated.userId },
    select: { nombre: true, apellido: true, documento: true },
  });

  // Retrieve prioridad from the creation audit log
  const creationLog = await db.attendanceAuditLog.findFirst({
    where: { incidentId: updated.id, accion: "CREATE_INCIDENT" },
    orderBy: { createdAt: "desc" },
    select: { valoresNuevos: true },
  });

  const valoresNuevos =
    creationLog?.valoresNuevos &&
    typeof creationLog.valoresNuevos === "object" &&
    !Array.isArray(creationLog.valoresNuevos)
      ? (creationLog.valoresNuevos as Record<string, unknown>)
      : null;

  const prioridad =
    valoresNuevos && typeof valoresNuevos.prioridad === "string"
      ? valoresNuevos.prioridad
      : null;

  return NextResponse.json({
    id: updated.id,
    name: `${targetUser?.nombre ?? ""} ${targetUser?.apellido ?? ""}`.trim(),
    documento: targetUser?.documento ?? "",
    tipo: updated.tipo as string,
    fecha: updated.fechaLaboral.toISOString().split("T")[0],
    descripcion: updated.descripcion,
    prioridad,
    estado: updated.estado as string,
    resolvedBy: updated.resueltoPorId ?? null,
  });
}, ["ADMIN", "SUPERVISOR"]);
