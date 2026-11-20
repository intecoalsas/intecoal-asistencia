// src/app/api/historial/semana/[weeklyPeriodId]/route.ts
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { consultarSemana } from "@/modules/historial";

/**
 * GET /api/historial/semana/:weeklyPeriodId
 *
 * Devuelve el resumen de la versión vigente (MAX exitoso) de un período semanal.
 *
 * Query params:
 *   detalle=true  → incluye el array de filas individuales por empleado/día.
 *
 * Permisos: ADMIN, SUPERVISOR.
 */
export const GET = requireAuth(async (req) => {
  // Extrae el ID del segmento dinámico de la URL de forma robusta
  const segments = new URL(req.url).pathname.split("/");
  const weeklyPeriodId = segments[segments.length - 1] ?? "";

  if (!weeklyPeriodId) {
    return NextResponse.json(
      { error: "El parámetro weeklyPeriodId es requerido" },
      { status: 400 }
    );
  }

  // Verificar que el período existe
  const periodo = await db.weeklyPeriod.findUnique({
    where: { id: weeklyPeriodId },
    select: { id: true },
  });

  if (!periodo) {
    return NextResponse.json(
      { error: "Período semanal no encontrado" },
      { status: 404 }
    );
  }

  const incluirDetalle =
    new URL(req.url).searchParams.get("detalle") === "true";

  const resumen = await consultarSemana(weeklyPeriodId, incluirDetalle);

  if (!resumen) {
    return NextResponse.json(
      { data: null, mensaje: "El período no tiene un cierre consolidado vigente" },
      { status: 200 }
    );
  }

  return NextResponse.json({ data: resumen });
}, ["ADMIN", "SUPERVISOR"]);
