// src/app/api/historial/marcaciones-tardias/rechazar/route.ts
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { rechazarMarcacion } from "@/modules/historial";
import { leerAccionMarcacion, respuestaErrorHistorial } from "../_shared";

/**
 * POST /api/historial/marcaciones-tardias/rechazar
 * Body: { marcacionId: string, motivo: string }
 *
 * Rechaza una marcación tardía PENDIENTE mediante rechazarMarcacion.
 * No toca Attendance ni el período; el registro se conserva como RECHAZADA.
 *
 * Permisos: solo ADMIN.
 */
export const POST = requireAuth(async (req, user) => {
  const entrada = await leerAccionMarcacion(req);
  if (entrada instanceof NextResponse) return entrada;

  try {
    const m = await rechazarMarcacion({
      lateMarcacionId: entrada.marcacionId,
      adminId: user.id,
      adminRole: user.role,
      motivo: entrada.motivo,
    });
    return NextResponse.json({
      data: { id: m.id, estado: m.estado },
      mensaje: "Marcación rechazada",
    });
  } catch (err) {
    return respuestaErrorHistorial(err, "rechazar");
  }
}, ["ADMIN"]);
