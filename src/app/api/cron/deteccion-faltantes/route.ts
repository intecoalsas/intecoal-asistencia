// src/app/api/cron/deteccion-faltantes/route.ts
/**
 * POST /api/cron/deteccion-faltantes
 *
 * Detección automática diaria de marcaciones faltantes (F7).
 * Reevalúa la ventana móvil de los últimos 31 días terminados, para que una
 * tardía PENDIENTE que luego pase a RECHAZADA quede detectada.
 * Idempotente: no duplica incidencias.
 *
 * Autenticación: Authorization: Bearer <CRON_SECRET> (mismo patrón que
 * /api/cron/cierre-semanal). Sin CRON_SECRET configurado, rechaza siempre.
 */
import { NextRequest, NextResponse } from "next/server";
import { bearerCoincide, leerSecreto } from "@/lib/secrets";
import { detectarFaltantes, ventanaPorDefecto } from "@/modules/incidencias/deteccion-faltantes.service";

function autenticarCron(req: NextRequest): boolean {
  // En producción, un CRON_SECRET ausente o de ejemplo lanza error explícito.
  const cronSecret = leerSecreto("CRON_SECRET");
  if (!cronSecret) return false;
  return bearerCoincide(req.headers.get("authorization"), cronSecret);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!autenticarCron(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    const resultado = await detectarFaltantes(ventanaPorDefecto(), null);
    return NextResponse.json({ ok: true, resultado });
  } catch (err) {
    console.error("[POST /api/cron/deteccion-faltantes] Error:", err);
    return NextResponse.json({ error: "Error interno en la detección de faltantes" }, { status: 500 });
  }
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ error: "Método no permitido" }, { status: 405 });
}
