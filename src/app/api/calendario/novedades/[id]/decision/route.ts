// src/app/api/calendario/novedades/[id]/decision/route.ts
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { decidirNovedad, respuestaError } from "@/modules/calendario/gestion.service";

/**
 * POST /api/calendario/novedades/:id/decision — { decision: "AUTORIZAR" | "RECHAZAR", motivo }
 * Solo ADMIN. Únicamente desde PENDIENTE.
 */
export const POST = requireAuth(async (req, user) => {
  try {
    const partes = new URL(req.url).pathname.split("/");
    const id = partes[partes.length - 2] ?? "";
    const body = (await req.json().catch(() => ({}))) as { decision?: unknown; motivo?: unknown };
    const { novedad, semanasCerradas } = await decidirNovedad({ id: user.id, role: user.role }, id, body);
    return NextResponse.json({
      data: novedad,
      semanasCerradas,
      mensaje:
        (novedad.estado === "AUTORIZADA" ? "Novedad autorizada" : "Novedad rechazada") +
        (semanasCerradas.length
          ? `. Cubre ${semanasCerradas.length} semana(s) ya cerrada(s): el historial no cambia hasta reabrir y volver a cerrar esas semanas.`
          : ""),
    });
  } catch (err) {
    const r = respuestaError(err, "POST /api/calendario/novedades/:id/decision");
    return NextResponse.json(r.body, { status: r.status });
  }
}, ["ADMIN"]);
