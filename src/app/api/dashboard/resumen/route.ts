// src/app/api/dashboard/resumen/route.ts
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { obtenerResumenDashboard } from "@/modules/dashboard/resumen.service";

/**
 * GET /api/dashboard/resumen — indicadores operativos del día (solo lectura).
 * Permisos: ADMIN y SUPERVISOR.
 */
export const GET = requireAuth(async () => {
  try {
    return NextResponse.json({ data: await obtenerResumenDashboard() });
  } catch (err) {
    console.error("[GET /api/dashboard/resumen] Error:", err);
    return NextResponse.json({ error: "No se pudo consultar el resumen del día" }, { status: 500 });
  }
}, ["ADMIN", "SUPERVISOR"]);
