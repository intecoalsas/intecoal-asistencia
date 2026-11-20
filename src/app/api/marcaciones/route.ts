
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import type { Role } from "@prisma/client";
import {
  evaluarPuntualidad,
  type EvaluacionPuntualidad,
} from "@/lib/attendance-utils";
import { formatBogota } from "@/lib/date-utils";
import { evaluarRango } from "@/lib/calendario.service";

type RegistroAgrupado = {
  name: string;
  id: string;
  userId: string;
  fechaLaboral: string;
  entradaManana: string;
  salidaAlmuerzo: string;
  entradaAlmuerzo: string;
  salidaJornada: string;
  entradaMananaDate: Date | null;
  entradaAlmuerzoDate: Date | null;
  marcas: Record<string, { id: string; version: number; corregida: boolean }>;
};

// Re-exportar para retrocompatibilidad con cualquier importador futuro
export type { EvaluacionPuntualidad };

/**
 * GET /api/marcaciones
 *
 * ADMIN: consulta todas las jornadas.
 * EMPLEADO: consulta únicamente sus jornadas.
 *
 * La puntualidad se calcula con la política que estaba
 * asignada al empleado en la fecha de cada jornada.
 */
export const GET = requireAuth(async (_req: Request, user) => {
  try {
    const role = user.role as Role;

    const whereClause =
      role === "ADMIN" || role === "SUPERVISOR" ? {} : { userId: user.id };

    const attendances = await db.attendance.findMany({
      where: whereClause,
      select: {
        id: true,
        createdAt: true,
        fechaLaboral: true,
        currentVersion: { select: { timestampUTC: true, versionNumber: true, estado: true } },
        tipo: true,
        userId: true,
        user: {
          select: {
            nombre: true,
            apellido: true,
            documento: true,
          },
        },
      },
      orderBy: {
        fechaLaboral: "desc",
      },
    });

    const groups: Record<string, RegistroAgrupado> = {};

    for (const attendance of attendances) {
      const dateKey = attendance.fechaLaboral
        .toISOString()
        .split("T")[0];

      const key = `${attendance.userId}-${dateKey}`;

      if (!groups[key]) {
        groups[key] = {
          name: `${attendance.user.nombre} ${attendance.user.apellido}`,
          id: attendance.user.documento,
          userId: attendance.userId,
          fechaLaboral: dateKey,
          entradaManana: "",
          salidaAlmuerzo: "",
          entradaAlmuerzo: "",
          salidaJornada: "",
          entradaMananaDate: null,
          entradaAlmuerzoDate: null,
          marcas: {},
        };
      }

      const record = groups[key];

      // Hora vigente: versión actual (corrección auditada) o registro original
      const momento = attendance.currentVersion?.timestampUTC ?? attendance.createdAt;
      record.marcas[attendance.tipo] = {
        id: attendance.id,
        version: attendance.currentVersion?.versionNumber ?? 0,
        corregida: attendance.currentVersion?.estado === "CORREGIDO",
      };

      const time = formatBogota(
        momento,
        "HH:mm"
      );

      switch (attendance.tipo) {
        case "ENTRADA_MANANA":
          record.entradaManana = time;
          record.entradaMananaDate = momento;
          break;

        case "SALIDA_ALMUERZO":
          record.salidaAlmuerzo = time;
          break;

        case "ENTRADA_ALMUERZO":
          record.entradaAlmuerzo = time;
          record.entradaAlmuerzoDate = momento;
          break;

        case "SALIDA_JORNADA":
          record.salidaJornada = time;
          break;
      }
    }

    // Calendario de todas las jornadas en una sola carga agrupada
    // (asignaciones, festivos activos y novedades autorizadas): sin N+1.
    const grupos = Object.values(groups);
    const fechasISO = grupos.map((g) => g.fechaLaboral).sort();
    const calendario = await evaluarRango(
      grupos.map((g) => g.userId),
      new Date(`${fechasISO[0] ?? "1970-01-01"}T00:00:00Z`),
      new Date(`${fechasISO[fechasISO.length - 1] ?? "1970-01-01"}T00:00:00Z`)
    );

    const registros = await Promise.all(
      grupos.map(async (record) => {
        const fechaConsulta = new Date(`${record.fechaLaboral}T00:00:00Z`);

        // Festivo > novedad autorizada > horario (calendario.service)
        const ev = calendario.evaluar(record.userId, fechaConsulta);
        const dayRule = ev.dayRule;

        // La puntualidad se evalúa en días laborables con regla de horario,
        // igual que las tardanzas del consolidado.
        const tieneHorario = ev.esLaborable;

        const puntualidadEntradaManana =
          evaluarPuntualidad(
            record.entradaMananaDate,
            dayRule?.horaEntradaManana ?? null,
            ev.toleranciaEntradaMin,
            tieneHorario
          );

        const puntualidadEntradaAlmuerzo =
          evaluarPuntualidad(
            record.entradaAlmuerzoDate,
            dayRule?.horaEntradaAlmuerzo ?? null,
            ev.toleranciaAlmuerzoMin,
            tieneHorario
          );

        // Construimos explícitamente la respuesta pública.
        // Así evitamos variables declaradas que ESLint
        // detectaba como no utilizadas.
        const publicRecord = {
          name: record.name,
          id: record.id,
          fechaLaboral: record.fechaLaboral,
          entradaManana: record.entradaManana,
          salidaAlmuerzo: record.salidaAlmuerzo,
          entradaAlmuerzo: record.entradaAlmuerzo,
          salidaJornada: record.salidaJornada,
        };

        const estado =
          publicRecord.entradaManana &&
            publicRecord.salidaAlmuerzo &&
            publicRecord.entradaAlmuerzo &&
            publicRecord.salidaJornada
            ? "Completo"
            : "Incompleto";

        const esImpuntual =
          puntualidadEntradaManana.estado === "Tarde" ||
          puntualidadEntradaAlmuerzo.estado === "Tarde";

        return {
          ...publicRecord,
          estado,
          puntualidadEntradaManana,
          puntualidadEntradaAlmuerzo,
          esImpuntual,
          esNoLaborableCalendario: ev.esNoLaborableCalendario,
          novedad: ev.novedad,
          seEsperanMarcaciones: ev.seEsperanMarcaciones,
          // Identificadores y versión de cada marca: solo para ADMIN y SUPERVISOR
          ...(role === "ADMIN" || role === "SUPERVISOR" ? { marcas: record.marcas } : {}),
        };
      })
    );

    return NextResponse.json({
      registros,
      role,
    });
  } catch (error) {
    console.error(
      "[GET /api/marcaciones] Error:",
      error
    );

    return NextResponse.json(
      {
        error: "No se pudieron consultar las marcaciones",
      },
      {
        status: 500,
      }
    );
  }
}, ["ADMIN", "EMPLEADO", "SUPERVISOR"]);
