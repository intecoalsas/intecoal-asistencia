// src/modules/dashboard/resumen.service.ts
/**
 * F8 — Resumen operativo del día para el Dashboard (solo lectura).
 *
 * Reglas aprobadas (fecha laboral de hoy en America/Bogota):
 *  1. Debían asistir: empleados activos con seEsperanMarcaciones (calendario.service:
 *     horario + festivo activo + novedad AUTORIZADA).
 *  2. Con novedad o festivo: informativos, no cuentan como ausencia.
 *  3. Ya registraron asistencia: debían asistir y tienen ≥1 Attendance (marca definitiva;
 *     incluye tardías INCORPORADAS). Las tardías PENDIENTES o RECHAZADAS no cuentan.
 *  4. Sin ninguna marca todavía: debían asistir y 0 marcas definitivas (estado operativo,
 *     no ausencia: la ausencia definitiva la registra F7).
 *  5. Con marcas pendientes en el día: debían asistir, 1–3 marcas definitivas.
 *  6. Tardanzas: entrada mañana / regreso de almuerzo «Tarde» con evaluarPuntualidad,
 *     usando la hora vigente (corrección F6 si existe) y la misma condición que
 *     /api/marcaciones (día laborable con regla de horario). Sin umbrales nuevos.
 *  7. Tardías pendientes de decisión: total LateMarcacion PENDIENTE (sin límite de fecha).
 *  8. Incidencias por revisar: total PENDIENTE o EN_REVISION, indicando las de F7.
 *
 * Nunca escribe en la base de datos.
 */
import type { TipoMarcacion, TipoNovedad } from "@prisma/client";
import { db } from "@/lib/db";
import { getNowUtc, getFechaLaboral } from "@/lib/date-utils";
import { evaluarPuntualidad } from "@/lib/attendance-utils";
import { evaluarRango, type EvaluacionDia } from "@/lib/calendario.service";

const SECUENCIA: TipoMarcacion[] = ["ENTRADA_MANANA", "SALIDA_ALMUERZO", "ENTRADA_ALMUERZO", "SALIDA_JORNADA"];
export const PREFIJO_DETECCION = "[Detección automática]";

export interface EmpleadoResumen { userId: string; nombre: string; documento: string }

/** Datos ya cargados para un día (permite calcular sin consultas). */
export interface DatosDia {
  empleados: EmpleadoResumen[];
  evaluar: (userId: string) => EvaluacionDia;
  /** Marcas definitivas del día por empleado: tipo → hora vigente (versión F6 o registro). */
  marcas: Map<string, Map<TipoMarcacion, Date>>;
  festivoHoy: string | null;
  tardiasPendientes: number;
  tardiasPendientesHoy: number;
  incidenciasPorRevisar: number;
  incidenciasAutomaticas: number;
}

export interface ResumenDashboard {
  fecha: string;
  festivo: string | null;
  debianAsistir: number;
  registraronAsistencia: number;
  sinMarca: EmpleadoResumen[];
  marcasPendientes: (EmpleadoResumen & { faltan: TipoMarcacion[] })[];
  jornadasCompletas: number;
  conNovedad: (EmpleadoResumen & { tipo: TipoNovedad })[];
  tardanzas: (EmpleadoResumen & { tipo: "ENTRADA_MANANA" | "ENTRADA_ALMUERZO"; minutos: number; horaProgramada: string })[];
  tardiasPendientes: number;
  tardiasPendientesHoy: number;
  incidenciasPorRevisar: number;
  incidenciasAutomaticas: number;
}

/** Cálculo puro del resumen a partir de datos ya cargados. */
export function construirResumen(fecha: string, d: DatosDia): ResumenDashboard {
  const r: ResumenDashboard = {
    fecha, festivo: d.festivoHoy, debianAsistir: 0, registraronAsistencia: 0, sinMarca: [],
    marcasPendientes: [], jornadasCompletas: 0, conNovedad: [], tardanzas: [],
    tardiasPendientes: d.tardiasPendientes, tardiasPendientesHoy: d.tardiasPendientesHoy,
    incidenciasPorRevisar: d.incidenciasPorRevisar, incidenciasAutomaticas: d.incidenciasAutomaticas,
  };

  for (const e of d.empleados) {
    const ev = d.evaluar(e.userId);
    const m = d.marcas.get(e.userId) ?? new Map<TipoMarcacion, Date>();

    if (ev.novedad && ev.esLaborable) r.conNovedad.push({ ...e, tipo: ev.novedad.tipo });

    if (ev.seEsperanMarcaciones) {
      r.debianAsistir++;
      if (m.size > 0) r.registraronAsistencia++;
      const faltan = SECUENCIA.filter((t) => !m.has(t));
      if (m.size === 0) r.sinMarca.push(e);
      else if (faltan.length > 0) r.marcasPendientes.push({ ...e, faltan });
      else r.jornadasCompletas++;
    }

    // Tardanzas: misma condición que /api/marcaciones (día laborable con regla)
    if (ev.esLaborable && ev.dayRule) {
      const casos: ["ENTRADA_MANANA" | "ENTRADA_ALMUERZO", string, number][] = [
        ["ENTRADA_MANANA", ev.dayRule.horaEntradaManana, ev.toleranciaEntradaMin],
        ["ENTRADA_ALMUERZO", ev.dayRule.horaEntradaAlmuerzo, ev.toleranciaAlmuerzoMin],
      ];
      for (const [tipo, hora, tol] of casos) {
        const ts = m.get(tipo);
        if (!ts) continue;
        const p = evaluarPuntualidad(ts, hora, tol, true);
        if (p.estado === "Tarde") r.tardanzas.push({ ...e, tipo, minutos: p.minutosRetraso, horaProgramada: hora });
      }
    }
  }

  const porNombre = (a: EmpleadoResumen, b: EmpleadoResumen) => a.nombre.localeCompare(b.nombre, "es");
  r.sinMarca.sort(porNombre);
  r.marcasPendientes.sort(porNombre);
  r.conNovedad.sort(porNombre);
  r.tardanzas.sort((a, b) => b.minutos - a.minutos);
  return r;
}

/** Carga los datos del día (solo lecturas, consultas agrupadas) y construye el resumen. */
export async function obtenerResumenDashboard(): Promise<ResumenDashboard> {
  const hoy = getFechaLaboral(getNowUtc());
  const fecha = hoy.toISOString().slice(0, 10);

  const asignaciones = await db.employeeScheduleAssignment.findMany({
    where: {
      validFrom: { lte: hoy },
      OR: [{ validUntil: null }, { validUntil: { gte: hoy } }],
      user: { isActive: true, role: "EMPLEADO" },
    },
    select: { user: { select: { id: true, nombre: true, apellido: true, documento: true } } },
  });
  const unicos = new Map<string, EmpleadoResumen>();
  for (const a of asignaciones) {
    unicos.set(a.user.id, { userId: a.user.id, nombre: `${a.user.nombre} ${a.user.apellido}`.trim(), documento: a.user.documento });
  }
  const empleados = [...unicos.values()];
  const ids = empleados.map((e) => e.userId);

  const [calendario, asistencias, festivo, tardiasPendientes, tardiasPendientesHoy, incidenciasPorRevisar, incidenciasAutomaticas] =
    await Promise.all([
      evaluarRango(ids, hoy, hoy),
      ids.length
        ? db.attendance.findMany({
            where: { userId: { in: ids }, fechaLaboral: hoy },
            select: { userId: true, tipo: true, createdAt: true, currentVersion: { select: { timestampUTC: true } } },
          })
        : Promise.resolve([]),
      db.diaNoLaborable.findFirst({ where: { fecha: hoy, isActive: true }, select: { descripcion: true } }),
      db.lateMarcacion.count({ where: { estado: "PENDIENTE" } }),
      db.lateMarcacion.count({ where: { estado: "PENDIENTE", fechaLaboral: hoy } }),
      db.attendanceIncident.count({ where: { estado: { in: ["PENDIENTE", "EN_REVISION"] } } }),
      db.attendanceIncident.count({ where: { estado: { in: ["PENDIENTE", "EN_REVISION"] }, descripcion: { startsWith: PREFIJO_DETECCION } } }),
    ]);

  const marcas = new Map<string, Map<TipoMarcacion, Date>>();
  for (const a of asistencias) {
    if (!marcas.has(a.userId)) marcas.set(a.userId, new Map());
    marcas.get(a.userId)!.set(a.tipo, a.currentVersion?.timestampUTC ?? a.createdAt);
  }

  return construirResumen(fecha, {
    empleados,
    evaluar: (userId) => calendario.evaluar(userId, hoy),
    marcas,
    festivoHoy: festivo?.descripcion ?? null,
    tardiasPendientes,
    tardiasPendientesHoy,
    incidenciasPorRevisar,
    incidenciasAutomaticas,
  });
}
