// src/app/api/calendario/festivos/[id]/route.ts
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { cambiarEstadoFestivo, respuestaError } from "@/modules/calendario/gestion.service";

/**
 * PATCH /api/calendario/festivos/:id — { isActive: boolean, motivo } (solo ADMIN).
 * Los festivos no se eliminan: solo se activan o desactivan.
 */
export const PATCH = requireAuth(async (req, user) => {
  try {
    const id = new URL(req.url).pathname.split("/").pop() ?? "";
    const body = (await req.json().catch(() => ({}))) as { isActive?: unknown; motivo?: unknown };
    const festivo = await cambiarEstadoFestivo({ id: user.id, role: user.role }, id, body);
    return NextResponse.json({
      data: festivo,
      mensaje: festivo.isActive ? "Festivo activado" : "Festivo desactivado",
    });
  } catch (err) {
    const r = respuestaError(err, "PATCH /api/calendario/festivos/:id");
    return NextResponse.json(r.body, { status: r.status });
  }
}, ["ADMIN"]);
