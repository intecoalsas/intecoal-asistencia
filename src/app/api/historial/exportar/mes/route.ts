// src/app/api/historial/exportar/mes/route.ts
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { consultarMes } from "@/modules/historial";
import { generarExcelMensual } from "@/lib/excel-historial";

const AÑO_MIN = 2000;
const AÑO_MAX = 2100;

/**
 * GET /api/historial/exportar/mes?anio=2027&mes=10
 *
 * Exporta a Excel el historial de un mes calendario.
 * Permisos: ADMIN, SUPERVISOR.
 */
export const GET = requireAuth(async (req) => {
  const params  = new URL(req.url).searchParams;
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
      { error: `El año debe ser un número entre ${AÑO_MIN} y ${AÑO_MAX}` },
      { status: 400 }
    );
  }

  if (isNaN(mes) || mes < 1 || mes > 12) {
    return NextResponse.json(
      { error: "El mes debe ser un número entre 1 y 12" },
      { status: 400 }
    );
  }

  const resumen  = await consultarMes(anio, mes);
  const buffer   = await generarExcelMensual(resumen);
  const filename = `historial-mensual-${anio}${String(mes).padStart(2,"0")}.xlsx`;

  return new NextResponse(buffer.buffer as ArrayBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buffer.byteLength),
    },
  });
}, ["ADMIN", "SUPERVISOR"]);

