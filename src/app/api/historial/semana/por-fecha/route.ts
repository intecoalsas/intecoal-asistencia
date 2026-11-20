// src/app/api/historial/semana/por-fecha/route.ts
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { consultarSemanaParaFecha } from "@/modules/historial";

/**
 * GET /api/historial/semana/por-fecha?fecha=YYYY-MM-DD
 *
 * Devuelve el resumen de la semana que contiene la fecha indicada,
 * usando la versión de cierre vigente (MAX exitoso).
 *
 * Query params:
 *   fecha        (obligatorio) YYYY-MM-DD
 *   detalle=true → incluye filas individuales por empleado/día.
 *
 * Permisos: ADMIN, SUPERVISOR.
 */
export const GET = requireAuth(async (req) => {
  const params = new URL(req.url).searchParams;
  const fechaStr = params.get("fecha");

  if (!fechaStr) {
    return NextResponse.json(
      { error: "El parámetro 'fecha' es requerido (formato YYYY-MM-DD)" },
      { status: 400 }
    );
  }

  // Validar formato YYYY-MM-DD estricto
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaStr)) {
    return NextResponse.json(
      { error: "Formato de fecha inválido. Use YYYY-MM-DD" },
      { status: 400 }
    );
  }

  const fecha = new Date(`${fechaStr}T12:00:00.000Z`);

  if (isNaN(fecha.getTime())) {
    return NextResponse.json(
      { error: "Fecha inválida" },
      { status: 400 }
    );
  }

  const incluirDetalle = params.get("detalle") === "true";

  const resumen = await consultarSemanaParaFecha(fecha, incluirDetalle);

  if (!resumen) {
    return NextResponse.json(
      { data: null, mensaje: "No se encontró un período con cierre consolidado vigente para esta fecha" },
      { status: 200 }
    );
  }

  return NextResponse.json({ data: resumen });
}, ["ADMIN", "SUPERVISOR"]);
