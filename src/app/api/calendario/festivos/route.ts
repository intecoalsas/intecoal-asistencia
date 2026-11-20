// src/app/api/calendario/festivos/route.ts
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { listarFestivos, crearFestivo, respuestaError } from "@/modules/calendario/gestion.service";

/** GET /api/calendario/festivos — listado de festivos (solo ADMIN). */
export const GET = requireAuth(async () => {
  try {
    return NextResponse.json({ data: await listarFestivos() });
  } catch (err) {
    const r = respuestaError(err, "GET /api/calendario/festivos");
    return NextResponse.json(r.body, { status: r.status });
  }
}, ["ADMIN"]);

/** POST /api/calendario/festivos — { fecha: "AAAA-MM-DD", descripcion } (solo ADMIN). */
export const POST = requireAuth(async (req, user) => {
  try {
    const body = (await req.json().catch(() => ({}))) as { fecha?: unknown; descripcion?: unknown };
    const festivo = await crearFestivo({ id: user.id, role: user.role }, body);
    return NextResponse.json({ data: festivo, mensaje: "Festivo registrado" }, { status: 201 });
  } catch (err) {
    const r = respuestaError(err, "POST /api/calendario/festivos");
    return NextResponse.json(r.body, { status: r.status });
  }
}, ["ADMIN"]);
