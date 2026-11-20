// src/app/api/historial/exportar/semana/route.ts
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { consultarSemana, consultarSemanaParaFecha } from "@/modules/historial";
import { generarExcelSemanal } from "@/lib/excel-historial";

/**
 * GET /api/historial/exportar/semana
 *
 * Exporta a Excel el historial de una semana (versión vigente).
 *
 * Query params (uno de los dos es obligatorio):
 *   weeklyPeriodId   ID directo del período
 *   fecha            YYYY-MM-DD  cualquier día de la semana
 *
 * Permisos: ADMIN, SUPERVISOR.
 */
export const GET = requireAuth(async (req) => {
  const params         = new URL(req.url).searchParams;
  const weeklyPeriodId = params.get("weeklyPeriodId");
  const fechaStr       = params.get("fecha");

  if (!weeklyPeriodId && !fechaStr) {
    return NextResponse.json(
      { error: "Se requiere 'weeklyPeriodId' o 'fecha' (YYYY-MM-DD)" },
      { status: 400 }
    );
  }

  let resumen = null;

  if (weeklyPeriodId) {
    // Verificar que el período existe
    const periodo = await db.weeklyPeriod.findUnique({
      where: { id: weeklyPeriodId },
      select: { id: true },
    });
    if (!periodo) {
      return NextResponse.json({ error: "Período no encontrado" }, { status: 404 });
    }
    resumen = await consultarSemana(weeklyPeriodId, true);
  } else if (fechaStr) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaStr)) {
      return NextResponse.json(
        { error: "Formato de fecha inválido. Use YYYY-MM-DD" },
        { status: 400 }
      );
    }
    resumen = await consultarSemanaParaFecha(
      new Date(`${fechaStr}T12:00:00.000Z`),
      true
    );
  }

  if (!resumen) {
    return NextResponse.json(
      { error: "El período no tiene un cierre consolidado vigente" },
      { status: 404 }
    );
  }

  const buffer   = await generarExcelSemanal(resumen);
  const ini      = new Date(resumen.inicioSemana);
  const fin      = new Date(resumen.finSemana);
  const filename = `historial-semanal-${ini.getUTCFullYear()}${String(ini.getUTCMonth()+1).padStart(2,"0")}${String(ini.getUTCDate()).padStart(2,"0")}-${String(fin.getUTCDate()).padStart(2,"0")}.xlsx`;

  return new NextResponse(buffer.buffer as ArrayBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buffer.byteLength),
    },
  });
}, ["ADMIN", "SUPERVISOR"]);

