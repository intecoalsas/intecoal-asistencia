// src/app/api/historial/marcaciones-tardias/route.ts
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { listarPendientes, HistorialError } from "@/modules/historial";

/**
 * GET /api/historial/marcaciones-tardias
 *
 * Bandeja de marcaciones tardías PENDIENTES (solo lectura).
 * El filtro y el orden los define listarPendientes; esta ruta solo añade
 * datos de presentación (empleado, semana, kiosco) por id.
 *
 * Permisos: solo ADMIN.
 */
export const GET = requireAuth(async (_req, user) => {
  try {
    const pendientes = await listarPendientes({ adminRole: user.role });

    const userIds = [...new Set(pendientes.map((m) => m.userId))];
    const periodoIds = [...new Set(pendientes.map((m) => m.weeklyPeriodId))];
    const kioskIds = [...new Set(pendientes.map((m) => m.kioskId).filter((k): k is string => !!k))];

    const [usuarios, periodos, kioscos] = await Promise.all([
      db.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, nombre: true, apellido: true, documento: true },
      }),
      db.weeklyPeriod.findMany({
        where: { id: { in: periodoIds } },
        select: { id: true, inicioSemana: true, finSemana: true, estado: true },
      }),
      kioskIds.length
        ? db.kioskDevice.findMany({
            where: { id: { in: kioskIds } },
            select: { id: true, codigo: true, nombre: true },
          })
        : Promise.resolve([]),
    ]);

    const uMap = new Map(usuarios.map((u) => [u.id, u]));
    const pMap = new Map(periodos.map((p) => [p.id, p]));
    const kMap = new Map(kioscos.map((k) => [k.id, k]));

    const data = pendientes.map((m) => ({
      id: m.id,
      tipo: m.tipo,
      estado: m.estado,
      fechaLaboral: m.fechaLaboral,
      timestampRealizacionUTC: m.timestampRealizacionUTC,
      timestampRecepcionUTC: m.timestampRecepcionUTC,
      createdAt: m.createdAt,
      empleado: uMap.get(m.userId) ?? { id: m.userId, nombre: null, apellido: null, documento: null },
      semana: pMap.get(m.weeklyPeriodId) ?? { id: m.weeklyPeriodId, inicioSemana: null, finSemana: null, estado: null },
      kiosco: m.kioskId ? kMap.get(m.kioskId) ?? { id: m.kioskId, codigo: null, nombre: null } : null,
    }));

    return NextResponse.json({ data });
  } catch (err) {
    if (err instanceof HistorialError) {
      const status = err.code === "ROLE_REQUIRED" ? 403 : 400;
      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    console.error("[GET /api/historial/marcaciones-tardias]", err);
    return NextResponse.json({ error: "Error interno al consultar marcaciones tardías" }, { status: 500 });
  }
}, ["ADMIN"]);
