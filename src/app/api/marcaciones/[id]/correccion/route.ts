// src/app/api/marcaciones/[id]/correccion/route.ts
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { corregirMarcacion } from "@/modules/historial/correccion.service";
import { HistorialError } from "@/modules/historial";
import type { HistorialErrorCode } from "@/modules/historial";

const HTTP: Record<HistorialErrorCode, number> = {
  MOTIVO_REQUIRED: 400,
  ROLE_REQUIRED: 403,
  PERIOD_NOT_FOUND: 404,
  INVALID_STATE: 409,
  CONFLICT: 409,
};

/**
 * POST /api/marcaciones/:id/correccion
 * Body: { nuevaHora: "HH:mm", motivo, versionEsperada: number, incidenciaId?, resolverIncidencia? }
 *
 * Corrige la hora de una marcación creando una nueva versión auditada.
 * Si la semana está cerrada: reapertura + corrección + nuevo cierre en una
 * sola transacción y consolidación de la nueva versión.
 *
 * Permisos: solo ADMIN. El responsable es siempre el usuario de la sesión.
 */
export const POST = requireAuth(async (req, user) => {
  try {
    const partes = new URL(req.url).pathname.split("/");
    const attendanceId = partes[partes.length - 2] ?? "";
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const r = await corregirMarcacion(
      { id: user.id, role: user.role },
      {
        attendanceId,
        nuevaHora: body.nuevaHora,
        motivo: body.motivo,
        versionEsperada: body.versionEsperada,
        incidenciaId: body.incidenciaId,
        resolverIncidencia: body.resolverIncidencia,
      }
    );
    return NextResponse.json({
      data: r,
      mensaje:
        `Marcación corregida de ${r.horaAnterior} a ${r.horaNueva} (versión ${r.versionNumber})` +
        (r.semanaCerrada ? ". La semana estaba cerrada: se generó una nueva versión de cierre." : ".") +
        (r.incidenciaResuelta ? " La incidencia quedó resuelta." : ""),
    });
  } catch (err) {
    if (err instanceof HistorialError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: HTTP[err.code] ?? 400 });
    }
    console.error("[POST /api/marcaciones/:id/correccion] Error:", err);
    return NextResponse.json({ error: "Error interno al corregir la marcación" }, { status: 500 });
  }
}, ["ADMIN"]);
