/**
 * verify-late-marcacion.ts — Fase 5: Verificaciones V1–V7
 *
 * Ejecutar con:
 *   npx tsx --tsconfig tsconfig.scripts.json src/scripts/verify-late-marcacion.ts
 *
 * Semana de prueba: 2027-10-04 (lunes). Independiente de semanas anteriores.
 */

import { db } from "@/lib/db";
import {
  getOrCreateWeeklyPeriod,
  cerrarPeriodo,
  registrarMarcacionTardia,
  listarPendientes,
  incorporarMarcacion,
  rechazarMarcacion,
  obtenerMarcacionTardia,
  listarMarcacionesTardiasPorPeriodo,
  HistorialError,
} from "@/modules/historial";
import { TipoCierre, EstadoMarcacionTardia, Role } from "@prisma/client";

// ---------------------------------------------------------------------------
// IDs de actores
// ---------------------------------------------------------------------------
const ADMIN_ID = "352c4ae5-35b3-4e7e-86e9-18605d42049b";
const SV_ID    = "09cb2496-4922-4fcd-a4a7-60a93afc5039";

// ---------------------------------------------------------------------------
// Helpers de fecha (igual que en verify-consolidado)
// ---------------------------------------------------------------------------
function midnightUTC(yyyyMmDd: string): Date {
  return new Date(yyyyMmDd + "T00:00:00.000Z");
}
function mediodiaUTC(yyyyMmDd: string): Date {
  // Para que calcularRangoSemana ubique la fecha correctamente en Bogotá
  return new Date(yyyyMmDd + "T12:00:00.000Z");
}

// ---------------------------------------------------------------------------
// Helpers de resultado
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;
function ok(label: string, detail?: string) {
  passed++;
  console.log(`  ✅ ${label}${detail ? " — " + detail : ""}`);
}
function fail(label: string, detail?: string) {
  failed++;
  console.error(`  ❌ ${label}${detail ? " — " + detail : ""}`);
}
function assert(cond: boolean, label: string, detail?: string) {
  cond ? ok(label, detail) : fail(label, detail);
}

// ---------------------------------------------------------------------------
// Setup: semana 2027-10-04 ya cerrada
// ---------------------------------------------------------------------------
let periodoId: string;
let cierreId: string;
const INICIO     = mediodiaUTC("2027-10-04");
const FEC_LABORAL = midnightUTC("2027-10-04"); // lunes, dentro del período

async function setup() {
  // Limpiar cualquier residuo previo
  const existente = await db.weeklyPeriod.findFirst({
    where: { inicioSemana: midnightUTC("2027-10-04") },
  });
  if (existente) {
    await db.lateMarcacion.deleteMany({ where: { weeklyPeriodId: existente.id } });
    await db.attendance.deleteMany({
      where: { userId: { in: [ADMIN_ID, SV_ID] }, fechaLaboral: midnightUTC("2027-10-04") },
    });
    await db.weeklyConsolidadoDia.deleteMany({
      where: { weeklyClosure: { weeklyPeriodId: existente.id } },
    });
    await db.closureAttempt.deleteMany({ where: { weeklyPeriodId: existente.id } });
    await db.weeklyClosure.deleteMany({ where: { weeklyPeriodId: existente.id } });
    await db.weeklyPeriod.delete({ where: { id: existente.id } });
  }

  // Crear período y cerrar (simula semana ya cerrada)
  const periodo = await getOrCreateWeeklyPeriod(INICIO);
  periodoId = periodo.id;

  const { cierre } = await cerrarPeriodo({
    weeklyPeriodId: periodoId,
    tipo: TipoCierre.MANUAL_ADMIN,
    actorId: ADMIN_ID,
    motivo: "Cierre inicial para pruebas Fase 5",
  });
  cierreId = cierre.id;
  console.log(`  ℹ️  Período: ${periodoId} | Cierre inicial: ${cierreId}`);
}

// ===========================================================================
// VERIFICACIONES
// ===========================================================================

// ---------------------------------------------------------------------------
// V1 — Registrar marcación tardía y conservar registro original
// ---------------------------------------------------------------------------
async function v1() {
  console.log("\nV1 — Registrar marcación tardía");

  const rec = await registrarMarcacionTardia({
    weeklyPeriodId: periodoId,
    userId: ADMIN_ID,
    tipo: "ENTRADA_MANANA",
    fechaLaboral: FEC_LABORAL,
    timestampRealizacionUTC: new Date("2027-10-04T12:05:00.000Z"),
    timestampRecepcionUTC:   new Date("2027-10-04T12:05:01.000Z"),
    kioskId: null,
  });

  assert(!!rec.id, "registro creado con ID");
  assert(rec.estado === EstadoMarcacionTardia.PENDIENTE, "estado = PENDIENTE");
  assert(rec.userId === ADMIN_ID, "userId correcto");
  assert(rec.tipo === "ENTRADA_MANANA", "tipo correcto");
  assert(rec.attendanceId === null, "attendanceId = null (sin Attendance todavía)");
  assert(rec.adminId === null, "adminId = null (sin decisión todavía)");
}

// ---------------------------------------------------------------------------
// V2 — Idempotencia: registrar la misma marcación dos veces
// ---------------------------------------------------------------------------
async function v2() {
  console.log("\nV2 — Idempotencia de registro (upsert)");

  const r1 = await registrarMarcacionTardia({
    weeklyPeriodId: periodoId,
    userId: ADMIN_ID,
    tipo: "ENTRADA_MANANA",
    fechaLaboral: FEC_LABORAL,
    timestampRealizacionUTC: new Date("2027-10-04T12:05:00.000Z"),
    timestampRecepcionUTC:   new Date("2027-10-04T12:05:01.000Z"),
  });

  const r2 = await registrarMarcacionTardia({
    weeklyPeriodId: periodoId,
    userId: ADMIN_ID,
    tipo: "ENTRADA_MANANA",
    fechaLaboral: FEC_LABORAL,
    timestampRealizacionUTC: new Date("2027-10-04T13:00:00.000Z"), // diferente, no importa
    timestampRecepcionUTC:   new Date("2027-10-04T13:00:01.000Z"),
  });

  assert(r1.id === r2.id, "mismo ID en ambas llamadas (idempotente)");
  assert(r2.timestampRealizacionUTC.getTime() === r1.timestampRealizacionUTC.getTime(),
    "registro original no fue sobrescrito");
}

// ---------------------------------------------------------------------------
// V3 — Consulta de pendientes: solo ADMIN puede
// ---------------------------------------------------------------------------
async function v3(lateMarcacionId: string) {
  console.log("\nV3 — Restricción de permisos en listarPendientes");

  // ADMIN puede consultar
  const pendientes = await listarPendientes({
    adminRole: Role.ADMIN,
    weeklyPeriodId: periodoId,
  });
  assert(pendientes.some(p => p.id === lateMarcacionId), "ADMIN ve la marcación pendiente");

  // No-ADMIN lanza error
  let errorCapturado: unknown = null;
  try {
    await listarPendientes({ adminRole: Role.SUPERVISOR, weeklyPeriodId: periodoId });
  } catch (e) {
    errorCapturado = e;
  }
  assert(
    errorCapturado instanceof HistorialError &&
    (errorCapturado as HistorialError).code === "ROLE_REQUIRED",
    "SUPERVISOR recibe ROLE_REQUIRED"
  );
}

// ---------------------------------------------------------------------------
// V4 — Rechazo con motivo
// ---------------------------------------------------------------------------
async function v4(lateMarcacionId: string) {
  console.log("\nV4 — Rechazar marcación con motivo");

  // Registrar una marcación separada (SV, SALIDA_ALMUERZO) para rechazarla
  const rec = await registrarMarcacionTardia({
    weeklyPeriodId: periodoId,
    userId: SV_ID,
    tipo: "SALIDA_ALMUERZO",
    fechaLaboral: FEC_LABORAL,
    timestampRealizacionUTC: new Date("2027-10-04T17:05:00.000Z"),
    timestampRecepcionUTC:   new Date("2027-10-04T17:05:01.000Z"),
  });

  // Rechazo sin motivo → MOTIVO_REQUIRED
  let err1: unknown = null;
  try {
    await rechazarMarcacion({ lateMarcacionId: rec.id, adminId: ADMIN_ID, adminRole: Role.ADMIN, motivo: "  " });
  } catch (e) { err1 = e; }
  assert(
    err1 instanceof HistorialError && (err1 as HistorialError).code === "MOTIVO_REQUIRED",
    "motivo vacío → MOTIVO_REQUIRED"
  );

  // Rechazo correcto
  const rechazada = await rechazarMarcacion({
    lateMarcacionId: rec.id,
    adminId: ADMIN_ID,
    adminRole: Role.ADMIN,
    motivo: "Marcación fuera de horario no autorizada",
  });
  assert(rechazada.estado === EstadoMarcacionTardia.RECHAZADA, "estado = RECHAZADA");
  assert(rechazada.adminId === ADMIN_ID, "adminId registrado");
  assert(rechazada.motivoRechazo === "Marcación fuera de horario no autorizada", "motivo conservado");
  assert(rechazada.resueltaEn !== null, "resueltaEn registrado");
  assert(rechazada.attendanceId === null, "attendanceId = null (no se creó Attendance)");

  // No se puede rechazar dos veces
  let err2: unknown = null;
  try {
    await rechazarMarcacion({ lateMarcacionId: rec.id, adminId: ADMIN_ID, adminRole: Role.ADMIN, motivo: "intento doble" });
  } catch (e) { err2 = e; }
  assert(
    err2 instanceof HistorialError && (err2 as HistorialError).code === "INVALID_STATE",
    "doble rechazo → INVALID_STATE"
  );
}

// ---------------------------------------------------------------------------
// V5 — Incorporación: flujo completo
// ---------------------------------------------------------------------------
async function v5(lateMarcacionIdV1: string) {
  console.log("\nV5 — Incorporación: flujo completo");

  // Incorporar sin motivo → MOTIVO_REQUIRED
  let err1: unknown = null;
  try {
    await incorporarMarcacion({
      lateMarcacionId: lateMarcacionIdV1,
      adminId: ADMIN_ID,
      adminRole: Role.ADMIN,
      motivo: "",
    });
  } catch (e) { err1 = e; }
  assert(
    err1 instanceof HistorialError && (err1 as HistorialError).code === "MOTIVO_REQUIRED",
    "motivo vacío → MOTIVO_REQUIRED"
  );

  // Verificar que el período está CERRADA antes de incorporar
  const per = await db.weeklyPeriod.findUniqueOrThrow({ where: { id: periodoId } });
  assert(per.estado === "CERRADA", "período CERRADA antes de incorporar");

  // Incorporar
  const result = await incorporarMarcacion({
    lateMarcacionId: lateMarcacionIdV1,
    adminId: ADMIN_ID,
    adminRole: Role.ADMIN,
    motivo: "Empleado acreditó justificación válida",
  });

  assert(result.lateMarcacion.estado === EstadoMarcacionTardia.INCORPORADA, "estado = INCORPORADA");
  assert(!!result.attendanceId, "attendanceId generado");
  assert(!!result.nuevoCierreId, "nuevoCierreId generado");
  assert(result.lateMarcacion.adminId === ADMIN_ID, "adminId registrado");
  assert(result.lateMarcacion.attendanceId === result.attendanceId, "attendanceId en LateMarcacion = Attendance.id");
  assert(result.lateMarcacion.resueltaEn !== null, "resueltaEn registrado");
  assert(result.nuevoCierreId !== cierreId, "nuevo cierre distinto del original");

  // Verificar que el Attendance fue creado con el timestamp correcto
  const att = await db.attendance.findUnique({ where: { id: result.attendanceId } });
  assert(!!att, "Attendance existe en BD");
  assert(att?.tipo === "ENTRADA_MANANA", "tipo correcto en Attendance");
  assert(
    att?.createdAt.getTime() === new Date("2027-10-04T12:05:00.000Z").getTime(),
    "createdAt = timestampRealizacionUTC",
    `valor: ${att?.createdAt.toISOString()}`
  );

  // Verificar que el período volvió a CERRADA con nueva versión
  const perPost = await db.weeklyPeriod.findUniqueOrThrow({ where: { id: periodoId } });
  assert(perPost.estado === "CERRADA", "período CERRADA tras incorporación");

  const nuevoCierre = await db.weeklyClosure.findUnique({ where: { id: result.nuevoCierreId } });
  assert(nuevoCierre?.version === 2, "nueva versión = 2", `valor: ${nuevoCierre?.version}`);

  return result.lateMarcacion.id;
}

// ---------------------------------------------------------------------------
// V6 — Protección contra duplicados: incorporar dos veces la misma
// ---------------------------------------------------------------------------
async function v6(lateMarcacionIdV1: string) {
  console.log("\nV6 — Protección contra duplicados");

  // La marcación V1 ya fue incorporada en V5 → estado INCORPORADA
  let err: unknown = null;
  try {
    await incorporarMarcacion({
      lateMarcacionId: lateMarcacionIdV1,
      adminId: ADMIN_ID,
      adminRole: Role.ADMIN,
      motivo: "intento duplicado",
    });
  } catch (e) { err = e; }
  assert(
    err instanceof HistorialError && (err as HistorialError).code === "INVALID_STATE",
    "segunda incorporación → INVALID_STATE"
  );
}

// ---------------------------------------------------------------------------
// V7 — Trazabilidad: registro original conservado
// ---------------------------------------------------------------------------
async function v7(lateMarcacionIdV1: string) {
  console.log("\nV7 — Trazabilidad: registro original conservado");

  const lm = await obtenerMarcacionTardia(lateMarcacionIdV1);
  assert(!!lm, "LateMarcacion existe en BD");
  assert(lm?.estado === EstadoMarcacionTardia.INCORPORADA, "estado final INCORPORADA");
  assert(lm?.timestampRealizacionUTC.getTime() === new Date("2027-10-04T12:05:00.000Z").getTime(),
    "timestampRealizacionUTC original conservado");
  assert(lm?.timestampRecepcionUTC.getTime() === new Date("2027-10-04T12:05:01.000Z").getTime(),
    "timestampRecepcionUTC original conservado");
  assert(lm?.tipo === "ENTRADA_MANANA", "tipo original conservado");
  assert(lm?.userId === ADMIN_ID, "userId original conservado");
  assert(!!lm?.attendanceId, "attendanceId vinculado");
  assert(!!lm?.adminId, "adminId registrado");
  assert(!!lm?.resueltaEn, "resueltaEn registrado");

  // Listar todas las marcaciones del período (incluye rechazada + incorporada)
  const todas = await listarMarcacionesTardiasPorPeriodo(periodoId, Role.ADMIN);
  assert(todas.length >= 2, "al menos 2 registros en el período", `total: ${todas.length}`);
  assert(todas.some(m => m.estado === "INCORPORADA"), "existe INCORPORADA");
  assert(todas.some(m => m.estado === "RECHAZADA"), "existe RECHAZADA");
}

// ===========================================================================
// MAIN
// ===========================================================================
async function main() {
  console.log("=".repeat(60));
  console.log("Verificaciones Fase 5 — Marcaciones tardías");
  console.log("=".repeat(60));

  try { await setup(); } catch (e) {
    console.error("Error en setup:", e);
    await db.$disconnect();
    process.exit(1);
  }

  let lateMarcacionIdV1: string | undefined;

  try { await v1(); } catch (e) { fail("V1 lanzó excepción", String(e)); }

  // Obtener ID de la LateMarcacion creada en V1
  const lmV1 = await db.lateMarcacion.findFirst({
    where: { weeklyPeriodId: periodoId, userId: ADMIN_ID, tipo: "ENTRADA_MANANA" },
  });
  lateMarcacionIdV1 = lmV1?.id;

  try { await v2(); } catch (e) { fail("V2 lanzó excepción", String(e)); }

  try {
    if (lateMarcacionIdV1) await v3(lateMarcacionIdV1);
    else fail("V3 omitida: V1 falló");
  } catch (e) { fail("V3 lanzó excepción", String(e)); }

  try {
    if (lateMarcacionIdV1) await v4(lateMarcacionIdV1);
    else fail("V4 omitida: V1 falló");
  } catch (e) { fail("V4 lanzó excepción", String(e)); }

  try {
    if (lateMarcacionIdV1) await v5(lateMarcacionIdV1);
    else fail("V5 omitida: V1 falló");
  } catch (e) { fail("V5 lanzó excepción", String(e)); }

  try {
    if (lateMarcacionIdV1) await v6(lateMarcacionIdV1);
    else fail("V6 omitida: V1 falló");
  } catch (e) { fail("V6 lanzó excepción", String(e)); }

  try {
    if (lateMarcacionIdV1) await v7(lateMarcacionIdV1);
    else fail("V7 omitida: V1 falló");
  } catch (e) { fail("V7 lanzó excepción", String(e)); }

  console.log("\n" + "=".repeat(60));
  console.log(`Resultado: ${passed} pasaron / ${failed} fallaron`);
  console.log("=".repeat(60));

  await db.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => {
  console.error("Error fatal:", e);
  db.$disconnect().finally(() => process.exit(1));
});
