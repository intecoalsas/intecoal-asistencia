// src/app/api/marcaciones/[id]/historial/route.ts
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { obtenerHistorialMarcacion } from "@/modules/historial/correccion.service";
import { HistorialError } from "@/modules/historial";

/**
 * GET /api/marcaciones/:id/historial — versiones y auditoría de una marcación.
 * Permisos: ADMIN y SUPERVISOR (consulta).
 */
export const GET = requireAuth(async (req) => {
  try {
    const partes = new URL(req.url).pathname.split("/");
    const data = await obtenerHistorialMarcacion(partes[partes.length - 2] ?? "");
    return NextResponse.json({ data });
  } catch (err) {
    if (err instanceof HistorialError) {
      return NextResponse.json({ error: err.message }, { status: err.code === "PERIOD_NOT_FOUND" ? 404 : 400 });
    }
    console.error("[GET /api/marcaciones/:id/historial] Error:", err);
    return NextResponse.json({ error: "Error interno al consultar el historial" }, { status: 500 });
  }
}, ["ADMIN", "SUPERVISOR"]);
