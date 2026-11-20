// src/app/api/historial/empleado/[userId]/route.ts
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { consultarEmpleado } from "@/modules/historial";

const AÑO_MIN = 2000;
const AÑO_MAX = 2100;

/**
 * GET /api/historial/empleado/:userId
 *
 * Devuelve el historial consolidado de un empleado individual.
 *
 * Query params (opcionales para filtrar rango):
 *   desde   YYYY-MM-DD  inicio del rango (inclusive)
 *   hasta   YYYY-MM-DD  fin del rango (inclusive)
 *   anio    número      año calendario (alternativa a desde/hasta)
 *   mes     1–12        mes dentro del año (sólo con anio)
 *
 * Lógica de rango:
 *   - Si se pasan `desde` y `hasta`, se usa ese rango.
 *   - Si se pasa `anio` + `mes`, el rango es el mes completo.
 *   - Si se pasa solo `anio`, el rango es el año completo.
 *   - Sin parámetros, se devuelve todo el historial disponible.
 *
 * Permisos: ADMIN, SUPERVISOR.
 */
export const GET = requireAuth(async (req) => {
  // Extrae el userId del segmento dinámico
  const segments = new URL(req.url).pathname.split("/");
  const userId = segments[segments.length - 1] ?? "";

  if (!userId) {
    return NextResponse.json(
      { error: "El parámetro userId es requerido" },
      { status: 400 }
    );
  }

  // Verificar que el usuario existe (incluye inactivos — historial preservado)
  const usuario = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, nombre: true, apellido: true, documento: true, isActive: true },
  });

  if (!usuario) {
    return NextResponse.json(
      { error: "Usuario no encontrado" },
      { status: 404 }
    );
  }

  // ── Parsear rango opcional ─────────────────────────────────────────────────
  const params  = new URL(req.url).searchParams;
  const desdeStr = params.get("desde");
  const hastaStr = params.get("hasta");
  const anioStr  = params.get("anio");
  const mesStr   = params.get("mes");

  let desde: Date | undefined;
  let hasta: Date | undefined;

  if (desdeStr || hastaStr) {
    // Rango explícito
    if (desdeStr) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(desdeStr)) {
        return NextResponse.json(
          { error: "Formato de 'desde' inválido. Use YYYY-MM-DD" },
          { status: 400 }
        );
      }
      desde = new Date(`${desdeStr}T00:00:00.000Z`);
      if (isNaN(desde.getTime())) {
        return NextResponse.json({ error: "Fecha 'desde' inválida" }, { status: 400 });
      }
    }
    if (hastaStr) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(hastaStr)) {
        return NextResponse.json(
          { error: "Formato de 'hasta' inválido. Use YYYY-MM-DD" },
          { status: 400 }
        );
      }
      hasta = new Date(`${hastaStr}T00:00:00.000Z`);
      if (isNaN(hasta.getTime())) {
        return NextResponse.json({ error: "Fecha 'hasta' inválida" }, { status: 400 });
      }
    }
    if (desde && hasta && desde > hasta) {
      return NextResponse.json(
        { error: "La fecha 'desde' no puede ser posterior a 'hasta'" },
        { status: 400 }
      );
    }
  } else if (anioStr) {
    // Rango por año / mes
    const anio = parseInt(anioStr, 10);
    if (isNaN(anio) || anio < AÑO_MIN || anio > AÑO_MAX) {
      return NextResponse.json(
        { error: `El año debe ser un número entero entre ${AÑO_MIN} y ${AÑO_MAX}` },
        { status: 400 }
      );
    }

    if (mesStr) {
      const mes = parseInt(mesStr, 10);
      if (isNaN(mes) || mes < 1 || mes > 12) {
        return NextResponse.json(
          { error: "El mes debe ser un número entero entre 1 y 12" },
          { status: 400 }
        );
      }
      // Rango del mes completo
      desde = new Date(Date.UTC(anio, mes - 1, 1));
      hasta = new Date(Date.UTC(anio, mes, 0)); // último día del mes
    } else {
      // Año completo
      desde = new Date(Date.UTC(anio, 0, 1));
      hasta = new Date(Date.UTC(anio, 11, 31));
    }
  }

  // La firma es consultarEmpleado(userId, inicioDesde, inicioHasta?)
  // Sin rango, se consulta desde el año 2000 sin límite superior
  const inicioDesde = desde ?? new Date(Date.UTC(AÑO_MIN, 0, 1));
  const resumen = await consultarEmpleado(userId, inicioDesde, hasta);

  return NextResponse.json({
    data: {
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        apellido: usuario.apellido,
        documento: usuario.documento,
        isActive: usuario.isActive,
      },
      ...resumen,
    },
  });
}, ["ADMIN", "SUPERVISOR"]);
