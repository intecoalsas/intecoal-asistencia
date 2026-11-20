// src/app/api/historial/mes/route.ts
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { consultarMes } from "@/modules/historial";

const AÑO_MIN = 2000;
const AÑO_MAX = 2100;

/**
 * GET /api/historial/mes?anio=2027&mes=8
 *
 * Devuelve el resumen de un mes calendario completo.
 * Las semanas que cruzan de mes distribuyen cada día en su mes real.
 *
 * Query params:
 *   anio  (obligatorio) número entero
 *   mes   (obligatorio) 1–12
 *
 * Permisos: ADMIN, SUPERVISOR.
 */
export const GET = requireAuth(async (req) => {
  const params = new URL(req.url).searchParams;

  const anioStr = params.get("anio");
  const mesStr  = params.get("mes");

  if (!anioStr || !mesStr) {
    return NextResponse.json(
      { error: "Los parámetros 'anio' y 'mes' son obligatorios" },
      { status: 400 }
    );
  }

  const anio = parseInt(anioStr, 10);
  const mes  = parseInt(mesStr,  10);

  if (isNaN(anio) || anio < AÑO_MIN || anio > AÑO_MAX) {
    return NextResponse.json(
      { error: `El año debe ser un número entero entre ${AÑO_MIN} y ${AÑO_MAX}` },
      { status: 400 }
    );
  }

  if (isNaN(mes) || mes < 1 || mes > 12) {
    return NextResponse.json(
      { error: "El mes debe ser un número entero entre 1 y 12" },
      { status: 400 }
    );
  }

  const resumen = await consultarMes(anio, mes);

  return NextResponse.json({ data: resumen });
}, ["ADMIN", "SUPERVISOR"]);
