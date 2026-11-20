// src/app/api/historial/marcaciones-tardias/_shared.ts
// Utilidades compartidas por las rutas de acción sobre marcaciones tardías.
// No contiene reglas de negocio: solo validación de entrada y mapeo de errores.
import { NextResponse } from "next/server";
import { HistorialError } from "@/modules/historial";
import type { HistorialErrorCode } from "@/modules/historial";

const HTTP_POR_CODIGO: Record<HistorialErrorCode, number> = {
  MOTIVO_REQUIRED: 400,
  ROLE_REQUIRED: 403,
  PERIOD_NOT_FOUND: 404,
  INVALID_STATE: 409,
  CONFLICT: 409,
};

export async function leerAccionMarcacion(
  req: Request
): Promise<{ marcacionId: string; motivo: string } | NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo JSON inválido" }, { status: 400 });
  }
  const { marcacionId, motivo } = (body ?? {}) as { marcacionId?: unknown; motivo?: unknown };
  if (typeof marcacionId !== "string" || !marcacionId.trim()) {
    return NextResponse.json({ error: "El campo 'marcacionId' es obligatorio" }, { status: 400 });
  }
  if (typeof motivo !== "string" || !motivo.trim()) {
    return NextResponse.json({ error: "El motivo es obligatorio" }, { status: 400 });
  }
  return { marcacionId: marcacionId.trim(), motivo };
}

export function respuestaErrorHistorial(err: unknown, accion: string): NextResponse {
  if (err instanceof HistorialError) {
    return NextResponse.json(
      { error: err.message, code: err.code },
      { status: HTTP_POR_CODIGO[err.code] ?? 400 }
    );
  }
  console.error(`[POST /api/historial/marcaciones-tardias/${accion}]`, err);
  return NextResponse.json(
    {
      error:
        `Error interno al ${accion} la marcación. ` +
        "Verifique el estado de la semana en la pestaña Cierres antes de reintentar.",
    },
    { status: 500 }
  );
}
