// src/modules/incidencias/deteccion-faltantes.service.ts
/**
 * F7 — Detección automática de marcaciones faltantes y ausencias.
 *
 * Regla documentada (ARQUITECTURA.md §2.5): MARCACION_FALTANTE cuando, al
 * cierre de la jornada, el empleado no completó sus 4 registros.
 *
 * Reglas aprobadas:
 *  1. Ausencia total y marcas incompletas se registran como MARCACION_FALTANTE;
 *     la descripción indica «Ausencia…» o «Faltan: …».
 *  2. Por tipo de marcación: cuenta como recibida si existe la Attendance
 *     (incluye tardías INCORPORADAS y correcciones de F6) o una LateMarcacion
 *     PENDIENTE de ese mismo tipo. Una tardía RECHAZADA no cuenta.
 *  3. Solo días ya terminados (nunca el día en curso). Ventana máxima de 31 días.
 *     El cron reevalúa la ventana móvil de los últimos 31 días.
 *  4. Automática por cron (CRON_SECRET) o manual por ADMIN.
 *  5. Idempotente: no se crea otra MARCACION_FALTANTE si ya existe una para
 *     ese empleado y fecha, en cualquier estado.
 *  6. Solo empleados activos (rol EMPLEADO).
 *
 * Se apoya en calendario.service: los días con festivo activo, no laborables
 * en el horario o con novedad AUTORIZADA no generan incidencias.
 *
 * Nunca crea ni modifica marcaciones, cierres ni consolidados. Las incidencias
 * nuevas solo se reflejan en consolidaciones de cierres futuros.
 */
import { Prisma, TipoMarcacion } from "@prisma/client";
import { db } from "@/lib/db";
import { getNowUtc, getFechaLaboral } from "@/lib/date-utils";
import { evaluarRango, aFechaLaboral } from "@/lib/calendario.service";

const SECUENCIA: TipoMarcacion[] = ["ENTRADA_MANANA", "SALIDA_ALMUERZO", "ENTRADA_ALMUERZO", "SALIDA_JORNADA"];
const NOMBRE: Record<TipoMarcacion, string> = {
  ENTRADA_MANANA: "entrada mañana",
  SALIDA_ALMUERZO: "salida almuerzo",
  ENTRADA_ALMUERZO: "entrada almuerzo",
  SALIDA_JORNADA: "salida jornada",
};
export const VENTANA_MAX_DIAS = 31;
const DIA_MS = 86_400_000;

export class DeteccionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeteccionError";
  }
}

export interface ResultadoDeteccion {
  desde: string;
  hasta: string;
  empleadosEvaluados: number;
  diasEvaluados: number;
  diasSinMarcasEsperadas: number;
  jornadasCompletas: number;
  incidenciasCreadas: number;
  ausencias: number;
  incompletas: number;
  omitidasPorExistente: number;
  conflictos: number;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Ventana por defecto: los 31 días terminados previos a hoy (fecha laboral Bogotá). */
export function ventanaPorDefecto(): { desde: Date; hasta: Date } {
  const hoy = getFechaLaboral(getNowUtc());
  const hasta = new Date(hoy.getTime() - DIA_MS);
  const desde = new Date(hasta.getTime() - (VENTANA_MAX_DIAS - 1) * DIA_MS);
  return { desde, hasta };
}

/**
 * Detecta y registra marcaciones faltantes en [desde, hasta] (fechas laborales).
 * @param actorId ADMIN que la ejecuta manualmente (para auditoría) o null si es el cron.
 * @param opciones.userIds Uso interno: limita la evaluación a esos empleados (no expuesto en las rutas).
 */
export async function detectarFaltantes(
  rango: { desde: Date; hasta: Date },
  actorId: string | null,
  opciones: { userIds?: string[] } = {}
): Promise<ResultadoDeteccion> {
  const hoy = getFechaLaboral(getNowUtc());
  const desde = aFechaLaboral(rango.desde);
  const hasta = aFechaLaboral(rango.hasta);
  if (hasta.getTime() >= hoy.getTime()) {
    throw new DeteccionError("Solo se pueden revisar días ya terminados: la fecha final debe ser anterior a hoy.");
  }
  if (desde.getTime() > hasta.getTime()) {
    throw new DeteccionError("La fecha inicial no puede ser posterior a la final.");
  }
  const dias = Math.round((hasta.getTime() - desde.getTime()) / DIA_MS) + 1;
  if (dias > VENTANA_MAX_DIAS) {
    throw new DeteccionError(`El rango no puede superar ${VENTANA_MAX_DIAS} días.`);
  }

  const r: ResultadoDeteccion = {
    desde: iso(desde), hasta: iso(hasta), empleadosEvaluados: 0, diasEvaluados: 0,
    diasSinMarcasEsperadas: 0, jornadasCompletas: 0, incidenciasCreadas: 0, ausencias: 0,
    incompletas: 0, omitidasPorExistente: 0, conflictos: 0,
  };

  // Empleados activos con alguna asignación que cubra el rango
  const asignaciones = await db.employeeScheduleAssignment.findMany({
    where: {
      validFrom: { lte: hasta },
      OR: [{ validUntil: null }, { validUntil: { gte: desde } }],
      user: { isActive: true, role: "EMPLEADO" },
      ...(opciones.userIds ? { userId: { in: opciones.userIds } } : {}),
    },
    select: { userId: true },
  });
  const userIds = [...new Set(asignaciones.map((a) => a.userId))];
  r.empleadosEvaluados = userIds.length;
  if (userIds.length === 0) return r;

  // Carga agrupada (sin N+1)
  const [calendario, asistencias, tardiasPendientes, existentes] = await Promise.all([
    evaluarRango(userIds, desde, hasta),
    db.attendance.findMany({
      where: { userId: { in: userIds }, fechaLaboral: { gte: desde, lte: hasta } },
      select: { userId: true, fechaLaboral: true, tipo: true },
    }),
    db.lateMarcacion.findMany({
      where: { userId: { in: userIds }, fechaLaboral: { gte: desde, lte: hasta }, estado: "PENDIENTE" },
      select: { userId: true, fechaLaboral: true, tipo: true },
    }),
    db.attendanceIncident.findMany({
      where: { userId: { in: userIds }, fechaLaboral: { gte: desde, lte: hasta }, tipo: "MARCACION_FALTANTE" },
      select: { userId: true, fechaLaboral: true },
    }),
  ]);

  const clave = (u: string, f: Date) => `${u}|${iso(f)}`;
  const recibidas = new Map<string, Set<TipoMarcacion>>();
  for (const m of [...asistencias, ...tardiasPendientes]) {
    const k = clave(m.userId, m.fechaLaboral);
    if (!recibidas.has(k)) recibidas.set(k, new Set());
    recibidas.get(k)!.add(m.tipo);
  }
  const yaDetectadas = new Set(existentes.map((e) => clave(e.userId, e.fechaLaboral)));

  for (const userId of userIds) {
    for (let i = 0; i < dias; i++) {
      const fecha = new Date(desde.getTime() + i * DIA_MS);
      r.diasEvaluados++;
      const ev = calendario.evaluar(userId, fecha);
      if (!ev.seEsperanMarcaciones) { r.diasSinMarcasEsperadas++; continue; }

      const k = clave(userId, fecha);
      const tiene = recibidas.get(k) ?? new Set<TipoMarcacion>();
      const faltan = SECUENCIA.filter((t) => !tiene.has(t));
      if (faltan.length === 0) { r.jornadasCompletas++; continue; }
      if (yaDetectadas.has(k)) { r.omitidasPorExistente++; continue; }

      const ausencia = faltan.length === SECUENCIA.length;
      const descripcion = ausencia
        ? "[Detección automática] Ausencia: no registró ninguna marcación en un día laborable."
        : `[Detección automática] Faltan: ${faltan.map((t) => NOMBRE[t]).join(", ")}.`;

      try {
        const creada = await db.$transaction(
          async (tx) => {
            // Revalidación dentro de la transacción (idempotencia ante ejecuciones simultáneas)
            const existe = await tx.attendanceIncident.findFirst({
              where: { userId, fechaLaboral: fecha, tipo: "MARCACION_FALTANTE" },
              select: { id: true },
            });
            if (existe) return false;
            const inc = await tx.attendanceIncident.create({
              data: { userId, fechaLaboral: fecha, tipo: "MARCACION_FALTANTE", estado: "PENDIENTE", descripcion },
            });
            if (actorId) {
              await tx.attendanceAuditLog.create({
                data: {
                  adminId: actorId,
                  accion: "CREATE_INCIDENT",
                  motivo: "Detección manual de marcaciones faltantes",
                  incidentId: inc.id,
                  valoresAnteriores: {},
                  valoresNuevos: { tipo: "MARCACION_FALTANTE", fechaLaboral: fecha.toISOString(), userId, faltan, origen: "deteccion_manual" },
                },
              });
            }
            return true;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
        );
        if (creada) {
          r.incidenciasCreadas++;
          if (ausencia) r.ausencias++; else r.incompletas++;
          yaDetectadas.add(k);
        } else {
          r.omitidasPorExistente++;
        }
      } catch (err) {
        const e = err as { code?: string; message?: string };
        if (e.code === "P2034" || (e.message ?? "").includes("deadlock")) {
          r.conflictos++; // otra ejecución simultánea; la siguiente pasada lo resuelve sin duplicar
          continue;
        }
        throw err;
      }
    }
  }

  return r;
}
