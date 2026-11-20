// src/app/api/historial/cierres/recuperar-consolidacion/route.ts
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { obtenerCierreVigente, recuperarConsolidacion } from "@/modules/historial";

/**
 * POST /api/historial/cierres/recuperar-consolidacion
 * Body: { periodoId: string }
 *
 * Recupera la consolidación de la versión de cierre VIGENTE de un período
 * mediante recuperarConsolidacion(cierreId, weeklyPeriodId).
 *  - No crea WeeklyClosure ni incrementa la versión.
 *  - Idempotente: consolidarPeriodo usa createMany con skipDuplicates.
 *  - Si la versión vigente ya tiene filas consolidadas responde 409 sin cambios.
 *
 * Permisos: solo ADMIN.
 */
export const POST = requireAuth(async (req) => {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo JSON inválido" }, { status: 400 });
  }
  const { periodoId } = (body ?? {}) as { periodoId?: unknown };
  if (typeof periodoId !== "string" || !periodoId.trim()) {
    return NextResponse.json({ error: "El campo 'periodoId' es obligatorio" }, { status: 400 });
  }

  const cierre = await obtenerCierreVigente(periodoId);
  if (!cierre) {
    return NextResponse.json(
      { error: "El período no tiene un cierre exitoso que consolidar" },
      { status: 404 }
    );
  }

  const filas = await db.weeklyConsolidadoDia.count({ where: { weeklyClosureId: cierre.id } });
  if (filas > 0) {
    return NextResponse.json(
      { error: `La versión vigente v${cierre.version} ya está consolidada (${filas} filas).` },
      { status: 409 }
    );
  }

  try {
    const r = await recuperarConsolidacion(cierre.id, periodoId);
    return NextResponse.json({
      data: { cierreId: cierre.id, version: cierre.version, filasCreadas: r.rowsCreated },
      mensaje: `Consolidación recuperada para v${cierre.version} (${r.rowsCreated} filas)`,
    });
  } catch (err) {
    console.error("[POST /api/historial/cierres/recuperar-consolidacion]", err);
    return NextResponse.json(
      { error: `No se pudo consolidar: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}, ["ADMIN"]);
