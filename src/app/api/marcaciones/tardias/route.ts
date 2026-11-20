// src/app/api/marcaciones/tardias/route.ts
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * GET /api/marcaciones/tardias
 *
 * Marcaciones tardías del empleado autenticado (solo lectura).
 * El empleado se identifica exclusivamente por la sesión; no acepta parámetros
 * de usuario. No expone datos administrativos (quién decidió, kiosco, ids internos
 * de asistencia).
 *
 * Permisos: solo EMPLEADO.
 */
export const GET = requireAuth(async (_req, user) => {
  try {
    const items = await db.lateMarcacion.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        tipo: true,
        fechaLaboral: true,
        timestampRecepcionUTC: true,
        estado: true,
        motivoRechazo: true,
        resueltaEn: true,
      },
      orderBy: [{ fechaLaboral: "desc" }, { timestampRecepcionUTC: "desc" }],
      take: 200,
    });

    const data = items.map((m) => ({
      id: m.id,
      tipo: m.tipo,
      fechaLaboral: m.fechaLaboral.toISOString().slice(0, 10),
      recibidaEn: m.timestampRecepcionUTC,
      estado: m.estado,
      // El motivo solo se muestra cuando la marcación fue rechazada.
      motivoRechazo: m.estado === "RECHAZADA" ? m.motivoRechazo : null,
      resueltaEn: m.resueltaEn,
    }));

    return NextResponse.json({ data });
  } catch (err) {
    console.error("[GET /api/marcaciones/tardias] Error:", err);
    return NextResponse.json(
      { error: "No se pudieron consultar tus marcaciones tardías" },
      { status: 500 }
    );
  }
}, ["EMPLEADO"]);
