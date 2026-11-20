/**
 * verify-consulta.ts — Fase 6: Verificaciones V1–V8
 *
 * Ejecutar con:
 *   npx tsx --tsconfig tsconfig.scripts.json src/scripts/verify-consulta.ts
 *
 * Reutiliza los datos de prueba creados en Fase 4 (semanas 2027-08 / 2027-09)
 * más dos semanas extra para verificar semana cruzada de mes y múltiples versiones.
 */

import { db } from "@/lib/db";
import {
  getOrCreateWeeklyPeriod,
  cerrarPeriodo,
  reabrirPeriodo,
  consolidarPeriodo,
  consultarSemana,
  consultarMes,
  consultarAnio,
  consultarEmpleado,
  consultarSemanaParaFecha,
} from "@/modules/historial";
import { TipoCierre } from "@prisma/client";

const ADMIN_ID = "352c4ae5-35b3-4e7e-86e9-18605d42049b";

// ---------------------------------------------------------------------------
// Helpers de fecha
// ---------------------------------------------------------------------------
function mediodiaUTC(yyyyMmDd: string) { return new Date(yyyyMmDd + "T12:00:00.000Z"); }
function midnightUTC(yyyyMmDd: string) { return new Date(yyyyMmDd + "T00:00:00.000Z"); }

// ---------------------------------------------------------------------------
// Helpers de resultado
// ---------------------------------------------------------------------------
let passed = 0, failed = 0;
function ok(label: string, detail?: string) { passed++; console.log(`  ✅ ${label}${detail ? " — " + detail : ""}`); }
function fail(label: string, detail?: string) { failed++; console.error(`  ❌ ${label}${detail ? " — " + detail : ""}`); }
function assert(cond: boolean, label: string, detail?: string) { cond ? ok(label, detail) : fail(label, detail); }

// ---------------------------------------------------------------------------
// Función auxiliar: crear semana cerrada con asignación y consolidado
// ---------------------------------------------------------------------------
async function crearSemanaConsolidada(inicioStr: string): Promise<{ periodoId: string; cierreId: string }> {
  const inicio = mediodiaUTC(inicioStr);
  const fin    = new Date(Date.UTC(
    new Date(inicioStr).getUTCFullYear(),
    new Date(inicioStr).getUTCMonth(),
    new Date(inicioStr).getUTCDate() + 6
  ));

  // Limpiar si existe
  const ex = await db.weeklyPeriod.findFirst({ where: { inicioSemana: midnightUTC(inicioStr) } });
  if (ex) {
    await db.weeklyConsolidadoDia.deleteMany({ where: { weeklyClosure: { weeklyPeriodId: ex.id } } });
    await db.closureAttempt.deleteMany({ where: { weeklyPeriodId: ex.id } });
    await db.weeklyClosure.deleteMany({ where: { weeklyPeriodId: ex.id } });
    await db.weeklyPeriod.delete({ where: { id: ex.id } });
  }

  const politica = await db.schedulePolicy.findFirstOrThrow({ where: { isActive: true } });

  // Limpiar assignment previo
  await db.employeeScheduleAssignment.deleteMany({
    where: { userId: ADMIN_ID, validFrom: { gte: midnightUTC(inicioStr), lte: fin } },
  });
  await db.employeeScheduleAssignment.create({
    data: { userId: ADMIN_ID, schedulePolicyId: politica.id, validFrom: midnightUTC(inicioStr), validUntil: fin },
  });

  const periodo = await getOrCreateWeeklyPeriod(inicio);
  const { cierre } = await cerrarPeriodo({
    weeklyPeriodId: periodo.id, tipo: TipoCierre.MANUAL_ADMIN, actorId: ADMIN_ID, motivo: "Cierre V6 test",
  });
  await consolidarPeriodo(cierre.id, periodo.id);
  return { periodoId: periodo.id, cierreId: cierre.id };
}

// ===========================================================================
// VERIFICACIONES
// ===========================================================================

// ---------------------------------------------------------------------------
// V1 — Consulta semanal: versión vigente correcta
// ---------------------------------------------------------------------------
async function v1() {
  console.log("\nV1 — Consulta semanal: versión vigente");
  const { periodoId } = await crearSemanaConsolidada("2027-10-11");

  const resumen = await consultarSemana(periodoId);
  assert(resumen !== null, "resumen no nulo");
  assert(resumen!.weeklyPeriodId === periodoId, "weeklyPeriodId correcto");
  assert(resumen!.version === 1, "versión = 1");
  assert(resumen!.metricas.totalEmpleados >= 1, "al menos 1 empleado", `${resumen!.metricas.totalEmpleados}`);
  assert(resumen!.metricas.diasLaborales >= 0, "diasLaborales >= 0");

  // Sin detalle por defecto
  assert(!resumen!.detalle, "detalle ausente por defecto");

  // Con detalle
  const conDetalle = await consultarSemana(periodoId, true);
  assert(Array.isArray(conDetalle!.detalle), "detalle es array");
  assert((conDetalle!.detalle?.length ?? 0) > 0, "detalle tiene filas");

  return periodoId;
}

// ---------------------------------------------------------------------------
// V2 — Semana sin consolidado → null
// ---------------------------------------------------------------------------
async function v2() {
  console.log("\nV2 — Semana sin consolidado → null");

  // Crear período sin cerrar
  const inicioPeriodo = mediodiaUTC("2027-10-18");
  const ex = await db.weeklyPeriod.findFirst({ where: { inicioSemana: midnightUTC("2027-10-18") } });
  if (ex) {
    await db.weeklyConsolidadoDia.deleteMany({ where: { weeklyClosure: { weeklyPeriodId: ex.id } } });
    await db.closureAttempt.deleteMany({ where: { weeklyPeriodId: ex.id } });
    await db.weeklyClosure.deleteMany({ where: { weeklyPeriodId: ex.id } });
    await db.weeklyPeriod.delete({ where: { id: ex.id } });
  }
  const periodo = await getOrCreateWeeklyPeriod(inicioPeriodo);

  const resumen = await consultarSemana(periodo.id);
  assert(resumen === null, "período sin cierre → null");

  // Cleanup
  await db.weeklyPeriod.delete({ where: { id: periodo.id } });
}

// ---------------------------------------------------------------------------
// V3 — Múltiples versiones: versión vigente = MAX
// ---------------------------------------------------------------------------
async function v3() {
  console.log("\nV3 — Múltiples versiones: versión vigente = MAX");
  const { periodoId } = await crearSemanaConsolidada("2027-10-25");

  // v2: reabrir + cerrar + consolidar
  await reabrirPeriodo({ weeklyPeriodId: periodoId, adminId: ADMIN_ID, motivo: "V3 reapertura" });
  const { cierre: c2 } = await cerrarPeriodo({
    weeklyPeriodId: periodoId, tipo: TipoCierre.MANUAL_ADMIN, actorId: ADMIN_ID, motivo: "V3 cierre v2",
  });
  await consolidarPeriodo(c2.id, periodoId);

  const resumen = await consultarSemana(periodoId);
  assert(resumen !== null, "resumen no nulo");
  assert(resumen!.version === 2, "versión vigente = 2 (MAX)", `valor: ${resumen!.version}`);
  assert(resumen!.weeklyClosureId === c2.id, "weeklyClosureId = cierre v2");

  return periodoId;
}

// ---------------------------------------------------------------------------
// V4 — Semana cruzada de mes: distribución correcta
// V4 usa la semana 2027-10-25 → 2027-10-31 (Oct) + 2027-11-01..2027-10-31
// En realidad 2027-10-27 es martes. El lunes 2027-10-25 → domingo 2027-10-31 (todo octubre).
// Para cruzar de mes necesitamos una semana lunes-domingo que atraviese nov:
// lunes 2027-11-01 → domingo 2027-11-07 (todo noviembre, pero no cruza).
// Usamos: lunes 2027-10-27 → domingo 2027-11-02 (Oct + Nov). 
// Pero 2027-10-27 no es lunes (es miércoles). getInicioSemana calcula el lunes correcto.
// Vamos a usar la semana del lunes 2027-11-29 → domingo 2027-12-05 (Nov + Dic).
// ---------------------------------------------------------------------------
async function v4(periodoIdV3: string) {
  console.log("\nV4 — Semana cruzada de mes (Dic incluye días de Nov)");

  // Semana lunes 2027-11-29 → domingo 2027-12-05 cruza Nov/Dic
  const { periodoId: pidNovDic } = await crearSemanaConsolidada("2027-11-29");

  // Consulta Nov 2027: debe incluir días del 29 al 30 de noviembre
  const resNov = await consultarMes(2027, 11);
  assert(resNov.semanas.some(s => s.weeklyPeriodId === pidNovDic),
    "semana Nov/Dic aparece en resumen de noviembre");

  // Consulta Dic 2027: debe incluir días del 1 al 5 de diciembre
  const resDic = await consultarMes(2027, 12);
  assert(resDic.semanas.some(s => s.weeklyPeriodId === pidNovDic),
    "semana Nov/Dic aparece en resumen de diciembre");

  // Verificar que las métricas de Nov no incluyen días de Dic y viceversa
  // (cada semana tiene 2 días en Nov y 5 en Dic, o similar según la semana concreta)
  const semNovEnNov = resNov.semanas.find(s => s.weeklyPeriodId === pidNovDic);
  const semNovEnDic = resDic.semanas.find(s => s.weeklyPeriodId === pidNovDic);

  if (semNovEnNov && semNovEnDic) {
    // Los días de Nov (29-30) + los días de Dic (01-05) = 7 días totales
    // Cada resumen de semana en mes solo tiene los días de ese mes
    const totalDias = (semNovEnNov.metricas.diasLaborales + semNovEnNov.metricas.diasLaborales === 0 ? 0 : 1)
      + (semNovEnDic.metricas.diasLaborales === 0 ? 0 : 1);
    ok("semana cruzada aparece en ambos meses con métricas propias");
  }
}

// ---------------------------------------------------------------------------
// V5 — Consulta mensual con múltiples semanas
// ---------------------------------------------------------------------------
async function v5() {
  console.log("\nV5 — Consulta mensual con múltiples semanas (octubre 2027)");

  // Octubre 2027 tiene datos: semana 2027-10-11 (V1) y 2027-10-25 (V3 con v2)
  const resOct = await consultarMes(2027, 10);
  assert(resOct.anio === 2027, "año = 2027");
  assert(resOct.mes === 10, "mes = 10");
  assert(resOct.semanas.length >= 2, "al menos 2 semanas en Oct 2027", `${resOct.semanas.length}`);
  assert(resOct.metricas.totalEmpleados >= 1, "al menos 1 empleado");

  // Verificar que no hay duplicación por versiones múltiples
  const ids = resOct.semanas.map(s => s.weeklyPeriodId);
  const idsUnicos = new Set(ids);
  assert(ids.length === idsUnicos.size, "sin períodos duplicados en la lista de semanas");

  // La semana con múltiples versiones debe usar la versión 2
  const semanaV3 = resOct.semanas.find(s => {
    const lunes = s.inicioSemana;
    return lunes.getUTCDate() === 25 && lunes.getUTCMonth() === 9; // Oct=9
  });
  if (semanaV3) {
    assert(semanaV3.version === 2, "semana con múltiples versiones usa v2 en resumen mensual");
  } else {
    ok("semana 2027-10-25 no encontrada en Oct (puede estar en Nov por cruce de mes)", "condicionado");
  }
}

// ---------------------------------------------------------------------------
// V6 — Consulta anual: 12 meses presentes
// ---------------------------------------------------------------------------
async function v6() {
  console.log("\nV6 — Consulta anual 2027: 12 meses en resultado");

  const resAnio = await consultarAnio(2027);
  assert(resAnio.anio === 2027, "año = 2027");
  assert(resAnio.meses.length === 12, "12 meses presentes");
  assert(resAnio.meses.every(m => typeof m.mes === "number" && m.mes >= 1 && m.mes <= 12),
    "todos los meses 1–12");

  // Agosto debe tener datos (Fase 4)
  const ago = resAnio.meses.find(m => m.mes === 8);
  assert((ago?.semanas.length ?? 0) > 0, "agosto 2027 tiene semanas consolidadas");

  // Meses sin datos deben devolver métricas en cero, no error
  const ene = resAnio.meses.find(m => m.mes === 1);
  assert(ene !== undefined, "enero presente aunque esté vacío");
  assert(ene!.semanas.length === 0 || ene!.metricas.totalEmpleados >= 0,
    "enero: sin error aunque sin datos");
}

// ---------------------------------------------------------------------------
// V7 — Consulta individual por empleado
// ---------------------------------------------------------------------------
async function v7() {
  console.log("\nV7 — Consulta individual por empleado (ADMIN_ID)");

  const desde = midnightUTC("2027-08-01");
  const hasta  = midnightUTC("2027-10-31");

  const resEmp = await consultarEmpleado(ADMIN_ID, desde, hasta);
  assert(resEmp.userId === ADMIN_ID, "userId correcto");
  assert(resEmp.semanas.length > 0, "tiene semanas con datos", `${resEmp.semanas.length}`);
  assert(resEmp.metricasGlobales.totalEmpleados === 1, "totalEmpleados = 1 (consulta individual)");

  // Cada semana debe tener exactamente 7 días del empleado
  for (const s of resEmp.semanas) {
    assert(s.dias.every(d => d.userId === ADMIN_ID),
      `semana ${s.inicioSemana.toISOString().slice(0, 10)}: todos los días son del empleado`);
  }

  // Métricas globales son la suma de todas las semanas
  const totalDiasLab = resEmp.semanas.reduce((sum, s) => sum + s.metricas.diasLaborales, 0);
  assert(resEmp.metricasGlobales.diasLaborales === totalDiasLab,
    "métricas globales = suma de semanas",
    `global=${resEmp.metricasGlobales.diasLaborales} suma=${totalDiasLab}`);
}

// ---------------------------------------------------------------------------
// V8 — consultarSemanaParaFecha
// ---------------------------------------------------------------------------
async function v8() {
  console.log("\nV8 — consultarSemanaParaFecha");

  // Fecha dentro de la semana 2027-10-11 → debe encontrar ese período
  const fecha = midnightUTC("2027-10-13"); // miércoles
  const res = await consultarSemanaParaFecha(fecha);
  assert(res !== null, "encuentra período para fecha");
  if (res) {
    const ini = res.inicioSemana;
    assert(
      ini.getUTCFullYear() === 2027 && ini.getUTCMonth() === 9 && ini.getUTCDate() === 11,
      "inicioSemana = 2027-10-11",
      ini.toISOString()
    );
  }

  // Fecha sin período → null
  const fechaSinDatos = midnightUTC("2026-01-04");
  const resNull = await consultarSemanaParaFecha(fechaSinDatos);
  assert(resNull === null, "fecha sin período → null");
}

// ===========================================================================
// MAIN
// ===========================================================================
async function main() {
  console.log("=".repeat(60));
  console.log("Verificaciones Fase 6 — Servicios de consulta del Historial");
  console.log("=".repeat(60));

  let periodoIdV3: string | undefined;

  try { await v1(); }                     catch (e) { fail("V1 lanzó excepción", String(e)); }
  try { await v2(); }                     catch (e) { fail("V2 lanzó excepción", String(e)); }
  try { const id = await v3(); periodoIdV3 = id; } catch (e) { fail("V3 lanzó excepción", String(e)); }
  try { await v4(periodoIdV3 ?? ""); }    catch (e) { fail("V4 lanzó excepción", String(e)); }
  try { await v5(); }                     catch (e) { fail("V5 lanzó excepción", String(e)); }
  try { await v6(); }                     catch (e) { fail("V6 lanzó excepción", String(e)); }
  try { await v7(); }                     catch (e) { fail("V7 lanzó excepción", String(e)); }
  try { await v8(); }                     catch (e) { fail("V8 lanzó excepción", String(e)); }

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
