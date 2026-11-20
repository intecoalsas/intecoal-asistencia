// src/app/api/incidencias/deteccion/route.ts
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import {
  detectarFaltantes,
  ventanaPorDefecto,
  DeteccionError,
} from "@/modules/incidencias/deteccion-faltantes.service";

/**
 * POST /api/incidencias/deteccion — { desde?: "AAAA-MM-DD", hasta?: "AAAA-MM-DD" }
 * Ejecución manual de la detección de marcaciones faltantes (F7).
 * Sin fechas: ventana de los últimos 31 días terminados. Máximo 31 días.
 * Permisos: solo ADMIN. Queda auditada con el ADMIN de la sesión.
 */
export const POST = requireAuth(async (req, user) => {
  try {
    const body = (await req.json().catch(() => ({}))) as { desde?: unknown; hasta?: unknown };
    const def = ventanaPorDefecto();
    const parse = (v: unknown, campo: string): Date | null => {
      if (v === undefined || v === null || v === "") return null;
      if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
        throw new DeteccionError(`El campo '${campo}' debe tener formato AAAA-MM-DD.`);
      }
      return new Date(`${v}T00:00:00Z`);
    };
    const desde = parse(body.desde, "desde") ?? def.desde;
    const hasta = parse(body.hasta, "hasta") ?? def.hasta;
    const resultado = await detectarFaltantes({ desde, hasta }, user.id);
    return NextResponse.json({
      resultado,
      mensaje:
        `Detección completada (${resultado.desde} a ${resultado.hasta}): ` +
        `${resultado.incidenciasCreadas} incidencia(s) nueva(s)` +
        (resultado.incidenciasCreadas ? ` (${resultado.ausencias} ausencia(s), ${resultado.incompletas} jornada(s) incompleta(s))` : "") +
        `, ${resultado.omitidasPorExistente} ya registrada(s).`,
    });
  } catch (err) {
    if (err instanceof DeteccionError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("[POST /api/incidencias/deteccion] Error:", err);
    return NextResponse.json({ error: "Error interno en la detección de faltantes" }, { status: 500 });
  }
}, ["ADMIN"]);
