// src/app/api/historial/cierres/reabrir/route.ts
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { reabrirPeriodo, HistorialError } from "@/modules/historial";
import type { HistorialErrorCode } from "@/modules/historial";

/**
 * POST /api/historial/cierres/reabrir
 * Body: { periodoId: string, motivo: string }
 *
 * Reabre un período CERRADA (pasa a REABIERTA) mediante reabrirPeriodo.
 * No crea ni modifica WeeklyClosure; la auditoría la registra el servicio.
 *
 * Permisos: solo ADMIN.
 */
const HTTP_POR_CODIGO: Record<HistorialErrorCode, number> = {
  MOTIVO_REQUIRED: 400,
  ROLE_REQUIRED: 403,
  PERIOD_NOT_FOUND: 404,
  INVALID_STATE: 409,
  CONFLICT: 409,
};

export const POST = requireAuth(async (req, user) => {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo JSON inválido" }, { status: 400 });
  }

  const { periodoId, motivo } = (body ?? {}) as { periodoId?: unknown; motivo?: unknown };

  if (typeof periodoId !== "string" || !periodoId.trim()) {
    return NextResponse.json({ error: "El campo 'periodoId' es obligatorio" }, { status: 400 });
  }
  if (typeof motivo !== "string" || !motivo.trim()) {
    return NextResponse.json({ error: "El motivo de reapertura es obligatorio" }, { status: 400 });
  }

  try {
    const periodo = await reabrirPeriodo({
      weeklyPeriodId: periodoId,
      adminId: user.id,
      motivo,
      ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? undefined,
      userAgent: req.headers.get("user-agent") ?? undefined,
    });

    return NextResponse.json({
      data: { id: periodo.id, estado: periodo.estado },
      mensaje: "Período reabierto correctamente",
    });
  } catch (err) {
    if (err instanceof HistorialError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: HTTP_POR_CODIGO[err.code] ?? 400 }
      );
    }
    console.error("[POST /api/historial/cierres/reabrir]", err);
    return NextResponse.json({ error: "Error interno al reabrir el período" }, { status: 500 });
  }
}, ["ADMIN"]);
