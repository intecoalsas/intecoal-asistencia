// src/app/api/historial/exportar/empleado/route.ts
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { consultarEmpleado } from "@/modules/historial";
import { generarExcelEmpleado } from "@/lib/excel-historial";

const AÑO_MIN = 2000;
const AÑO_MAX = 2100;

/**
 * GET /api/historial/exportar/empleado?userId=...
 *
 * Exporta a Excel el historial individual de un empleado.
 *
 * Query params:
 *   userId  (obligatorio)
 *   anio    (opcional) año calendario
 *   mes     (opcional, con anio) mes 1-12
 *   desde   (opcional) YYYY-MM-DD
 *   hasta   (opcional) YYYY-MM-DD
 *
 * Permisos: ADMIN, SUPERVISOR.
 */
export const GET = requireAuth(async (req) => {
  const params  = new URL(req.url).searchParams;
  const userId  = params.get("userId");

  if (!userId) {
    return NextResponse.json({ error: "El parámetro 'userId' es obligatorio" }, { status: 400 });
  }

  const usuario = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, nombre: true, apellido: true, documento: true },
  });

  if (!usuario) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  // Rango
  const anioStr  = params.get("anio");
  const mesStr   = params.get("mes");
  const desdeStr = params.get("desde");
  const hastaStr = params.get("hasta");

  let desde: Date = new Date(Date.UTC(AÑO_MIN, 0, 1));
  let hasta: Date | undefined;

  if (desdeStr || hastaStr) {
    if (desdeStr) desde = new Date(`${desdeStr}T00:00:00.000Z`);
    if (hastaStr) hasta = new Date(`${hastaStr}T00:00:00.000Z`);
  } else if (anioStr) {
    const anio = parseInt(anioStr, 10);
    if (isNaN(anio) || anio < AÑO_MIN || anio > AÑO_MAX) {
      return NextResponse.json({ error: "Año inválido" }, { status: 400 });
    }
    if (mesStr) {
      const mes = parseInt(mesStr, 10);
      if (isNaN(mes) || mes < 1 || mes > 12) {
        return NextResponse.json({ error: "Mes inválido" }, { status: 400 });
      }
      desde = new Date(Date.UTC(anio, mes - 1, 1));
      hasta = new Date(Date.UTC(anio, mes, 0));
    } else {
      desde = new Date(Date.UTC(anio, 0, 1));
      hasta = new Date(Date.UTC(anio, 11, 31));
    }
  }

  const resumen = await consultarEmpleado(userId, desde, hasta);
  const nombre  = `${usuario.nombre ?? ""} ${usuario.apellido ?? ""}`.trim();
  const buffer  = await generarExcelEmpleado(resumen, nombre, usuario.documento ?? "");

  const slugNombre = nombre.replace(/\s+/g, "-").toLowerCase().replace(/[^a-z0-9-]/g, "");
  const filename   = `historial-empleado-${slugNombre}.xlsx`;

  return new NextResponse(buffer.buffer as ArrayBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buffer.byteLength),
    },
  });
}, ["ADMIN", "SUPERVISOR"]);

