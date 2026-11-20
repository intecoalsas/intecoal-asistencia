// src/app/api/historial/marcaciones-tardias/incorporar/route.ts
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { incorporarMarcacion } from "@/modules/historial";
import { leerAccionMarcacion, respuestaErrorHistorial } from "../_shared";

/**
 * POST /api/historial/marcaciones-tardias/incorporar
 * Body: { marcacionId: string, motivo: string }
 *
 * Incorpora una marcación tardía PENDIENTE mediante incorporarMarcacion
 * (reapertura → Attendance → INCORPORADA → nuevo cierre → consolidación).
 *
 * Permisos: solo ADMIN.
 */
export const POST = requireAuth(async (req, user) => {
  const entrada = await leerAccionMarcacion(req);
  if (entrada instanceof NextResponse) return entrada;

  try {
    const r = await incorporarMarcacion({
      lateMarcacionId: entrada.marcacionId,
      adminId: user.id,
      adminRole: user.role,
      motivo: entrada.motivo,
    });
    return NextResponse.json({
      data: {
        id: r.lateMarcacion.id,
        estado: r.lateMarcacion.estado,
        attendanceId: r.attendanceId,
        nuevoCierreId: r.nuevoCierreId,
      },
      mensaje: "Marcación incorporada y semana cerrada con una nueva versión",
    });
  } catch (err) {
    return respuestaErrorHistorial(err, "incorporar");
  }
}, ["ADMIN"]);
