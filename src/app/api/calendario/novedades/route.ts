// src/app/api/calendario/novedades/route.ts
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { listarNovedades, registrarNovedad, respuestaError } from "@/modules/calendario/gestion.service";

/**
 * GET /api/calendario/novedades?userId=&tipo=&estado=&desde=&hasta=
 * ADMIN y SUPERVISOR.
 */
export const GET = requireAuth(async (req) => {
  try {
    const p = new URL(req.url).searchParams;
    const data = await listarNovedades({
      userId: p.get("userId"),
      tipo: p.get("tipo"),
      estado: p.get("estado"),
      desde: p.get("desde"),
      hasta: p.get("hasta"),
    });
    return NextResponse.json({ data });
  } catch (err) {
    const r = respuestaError(err, "GET /api/calendario/novedades");
    return NextResponse.json(r.body, { status: r.status });
  }
}, ["ADMIN", "SUPERVISOR"]);

/**
 * POST /api/calendario/novedades — { userId, tipo, fechaInicio, fechaFin, motivo }
 * ADMIN y SUPERVISOR. Siempre nace PENDIENTE; quien registra es el usuario de la sesión.
 */
export const POST = requireAuth(async (req, user) => {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const novedad = await registrarNovedad({ id: user.id, role: user.role }, {
      userId: body.userId,
      tipo: body.tipo,
      fechaInicio: body.fechaInicio,
      fechaFin: body.fechaFin,
      motivo: body.motivo,
    });
    return NextResponse.json({ data: novedad, mensaje: "Novedad registrada como PENDIENTE" }, { status: 201 });
  } catch (err) {
    const r = respuestaError(err, "POST /api/calendario/novedades");
    return NextResponse.json(r.body, { status: r.status });
  }
}, ["ADMIN", "SUPERVISOR"]);
