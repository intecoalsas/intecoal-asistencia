// src/app/api/historial/anio/route.ts
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { consultarAnio } from "@/modules/historial";

const AÑO_MIN = 2000;
const AÑO_MAX = 2100;

/**
 * GET /api/historial/anio?anio=2027
 *
 * Devuelve el resumen anual con los 12 meses.
 * Los meses sin datos aparecen con métricas en cero y semanas vacías.
 *
 * Query params:
 *   anio  (obligatorio) número entero
 *
 * Permisos: ADMIN, SUPERVISOR.
 */
export const GET = requireAuth(async (req) => {
  const params = new URL(req.url).searchParams;
  const anioStr = params.get("anio");

  if (!anioStr) {
    return NextResponse.json(
      { error: "El parámetro 'anio' es obligatorio" },
      { status: 400 }
    );
  }

  const anio = parseInt(anioStr, 10);

  if (isNaN(anio) || anio < AÑO_MIN || anio > AÑO_MAX) {
    return NextResponse.json(
      { error: `El año debe ser un número entero entre ${AÑO_MIN} y ${AÑO_MAX}` },
      { status: 400 }
    );
  }

  const resumen = await consultarAnio(anio);

  return NextResponse.json({ data: resumen });
}, ["ADMIN", "SUPERVISOR"]);
