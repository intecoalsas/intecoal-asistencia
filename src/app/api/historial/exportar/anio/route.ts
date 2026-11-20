// src/app/api/historial/exportar/anio/route.ts
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { consultarAnio } from "@/modules/historial";
import { generarExcelAnual } from "@/lib/excel-historial";

const AÑO_MIN = 2000;
const AÑO_MAX = 2100;

/**
 * GET /api/historial/exportar/anio?anio=2027
 *
 * Exporta a Excel el historial anual completo (12 meses).
 * Permisos: ADMIN, SUPERVISOR.
 */
export const GET = requireAuth(async (req) => {
  const params  = new URL(req.url).searchParams;
  const anioStr = params.get("anio");

  if (!anioStr) {
    return NextResponse.json({ error: "El parámetro 'anio' es obligatorio" }, { status: 400 });
  }

  const anio = parseInt(anioStr, 10);

  if (isNaN(anio) || anio < AÑO_MIN || anio > AÑO_MAX) {
    return NextResponse.json(
      { error: `El año debe ser un número entre ${AÑO_MIN} y ${AÑO_MAX}` },
      { status: 400 }
    );
  }

  const resumen  = await consultarAnio(anio);
  const buffer   = await generarExcelAnual(resumen);
  const filename = `historial-anual-${anio}.xlsx`;

  return new NextResponse(buffer.buffer as ArrayBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buffer.byteLength),
    },
  });
}, ["ADMIN", "SUPERVISOR"]);

