/**
 * verify-attempt-fix.ts
 *
 * Verificaciones de la corrección Fase 3.2 (attempt.service.ts).
 *
 * V1 — Reconciliación: cierre por otra operación no atribuye EXITO
 * V2 — Reconciliación con reapertura intermedia detectada
 * V3 — Reconciliación sin evidencia (período en ABIERTA)
 * V4 — Dos ejecuciones concurrentes: exactamente 1 pasa (SELECT FOR UPDATE)
 * V5 — Numeración consecutiva de intentos tras reapertura
 * V6 — Fases anteriores intactas (período 3.1 y getCurrentWeeklyPeriod)
 *
 * Ejecutar:
 *   npx tsx --tsconfig tsconfig.scripts.json src/scripts/verify-attempt-fix.ts
 */

import { db } from "@/lib/db";
import {
  cerrarPeriodo,
  reabrirPeriodo,
  getCurrentWeeklyPeriod,
  reconciliarIntentoAbandonado,
  ejecutarCierrePeriodo,
} from "@/modules/historial";
import { EstadoPeriodo, TipoCierre, ResultadoIntento } from "@prisma/client";

// ---------------------------------------------------------------------------
// Constantes de prueba
// ---------------------------------------------------------------------------

const ADMIN_ID      = "352c4ae5-35b3-4e7e-86e9-18605d42049b";
// ID del período de Fase 3.1 (debe conservar exactamente 4 cierres)
const PERIODO_31_ID = "7e331e7c-a551-43af-a2aa-a2039a1f8b4d";

// ---------------------------------------------------------------------------
// Helpers de salida
// ---------------------------------------------------------------------------
function ok(label: string): void   { console.log(`   ✅ ${label}`); }
function fail(label: string, detail?: unknown): void {
  console.error(`   ❌ ${label}`, detail ?? "");
}
function header(v: string, desc: string): void {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`${v} — ${desc}`);
  console.log("─".repeat(60));
}

// ---------------------------------------------------------------------------
// Helpers de BD
// ---------------------------------------------------------------------------

/**
 * Obtiene o crea un WeeklyPeriod, forzando estado ABIERTA.
 * Si limpiar=true, elimina cierres e intentos previos para un test fresco.
 */
async function prepararPeriodo(
  inicioSemana: Date,
  finSemana: Date,
  limpiar = false
): Promise<string> {
  const existente = await db.weeklyPeriod.findUnique({ where: { inicioSemana } });

  if (existente) {
    if (limpiar) {
      // Eliminar consolidados → cierres → intentos (en orden de dependencia)
      await db.weeklyConsolidadoDia.deleteMany({
        where: { weeklyClosure: { weeklyPeriodId: existente.id } },
      });
      await db.weeklyClosure.deleteMany({ where: { weeklyPeriodId: existente.id } });
      await db.closureAttempt.deleteMany({ where: { weeklyPeriodId: existente.id } });
    }
    await db.weeklyPeriod.update({
      where: { id: existente.id },
      data: { estado: EstadoPeriodo.ABIERTA },
    });
    return existente.id;
  }

  const p = await db.weeklyPeriod.create({
    data: { inicioSemana, finSemana, estado: EstadoPeriodo.ABIERTA },
  });
  return p.id;
}

/** Inserta un ClosureAttempt EN_PROGRESO con fecha pasada (simula abandono). */
async function insertarIntentoSimulado(
  weeklyPeriodId: string,
  iniciado: Date
): Promise<string> {
  const agg = await db.closureAttempt.aggregate({
    where: { weeklyPeriodId },
    _max: { intentoNum: true },
  });
  const intentoNum = (agg._max.intentoNum ?? 0) + 1;
  const intento = await db.closureAttempt.create({
    data: { weeklyPeriodId, intentoNum, resultado: ResultadoIntento.EN_PROGRESO, iniciado },
  });
  return intento.id;
}

// ---------------------------------------------------------------------------
// V1 — Reconciliación: cierre por otra operación no atribuye EXITO
// ---------------------------------------------------------------------------
async function V1(): Promise<boolean> {
  header("V1", "Reconciliación: cierre externo no atribuye EXITO al intento");
  try {
    const idF = await prepararPeriodo(
      new Date("2027-06-07"), new Date("2027-06-13"), true
    );
    console.log(`   Período F: ${idF}`);

    // Intento simulado con fecha 61 min atrás (por encima del umbral de abandono)
    const hace1h  = new Date(Date.now() - 61 * 60_000);
    const intentoId = await insertarIntentoSimulado(idF, hace1h);
    console.log(`   Intento simulado: ${intentoId}`);

    // Cierre directo via cerrarPeriodo (sin pasar por ejecutarCierrePeriodo)
    const { cierre } = await cerrarPeriodo({
      weeklyPeriodId: idF,
      tipo: TipoCierre.MANUAL_ADMIN,
      actorId: ADMIN_ID,
      motivo: "Cierre V1 test independiente",
    });
    console.log(`   Cierre directo: ${cierre.id} v${cierre.version}`);

    const intentoObj = await db.closureAttempt.findUniqueOrThrow({ where: { id: intentoId } });
    const reconciliado = await reconciliarIntentoAbandonado(intentoObj, idF);
    console.log(`   resultado: ${reconciliado.resultado}`);
    console.log(`   errorMsg: ${reconciliado.errorMsg}`);

    if (reconciliado.resultado !== ResultadoIntento.FALLO) {
      fail("Esperado FALLO, obtuvo " + reconciliado.resultado);
      return false;
    }
    if (!reconciliado.errorMsg?.includes("REVISION_REQUERIDA")) {
      fail("El errorMsg debería contener REVISION_REQUERIDA: " + reconciliado.errorMsg);
      return false;
    }
    ok("Cierre externo → FALLO con REVISION_REQUERIDA (nunca EXITO sin FK)");
    return true;
  } catch (e) {
    fail("Excepción en V1", e);
    return false;
  }
}

// ---------------------------------------------------------------------------
// V2 — Reconciliación con reapertura intermedia
// ---------------------------------------------------------------------------
async function V2(): Promise<boolean> {
  header("V2", "Reconciliación con reapertura intermedia detectada");
  try {
    const idG = await prepararPeriodo(
      new Date("2027-06-14"), new Date("2027-06-20"), true
    );
    console.log(`   Período G: ${idG}`);

    const T0 = new Date(Date.now() - 61 * 60_000);
    const intentoId = await insertarIntentoSimulado(idG, T0);
    console.log(`   Intento simulado (T0=${T0.toISOString()}): ${intentoId}`);

    // Cerrar v1
    const { cierre: c1 } = await cerrarPeriodo({
      weeklyPeriodId: idG,
      tipo: TipoCierre.MANUAL_ADMIN,
      actorId: ADMIN_ID,
      motivo: "Cierre v1 V2 test",
    });
    console.log(`   Cierre v1: ${c1.id}`);

    // Reabrir
    await reabrirPeriodo({
      weeklyPeriodId: idG,
      adminId: ADMIN_ID,
      motivo: "Reapertura V2 test",
    });
    console.log("   Reapertura registrada");

    // Cerrar v2
    const { cierre: c2 } = await cerrarPeriodo({
      weeklyPeriodId: idG,
      tipo: TipoCierre.MANUAL_ADMIN,
      actorId: ADMIN_ID,
      motivo: "Cierre v2 V2 test",
    });
    console.log(`   Cierre v2: ${c2.id}`);

    const intentoObj = await db.closureAttempt.findUniqueOrThrow({ where: { id: intentoId } });
    const reconciliado = await reconciliarIntentoAbandonado(intentoObj, idG);
    console.log(`   resultado: ${reconciliado.resultado}`);
    console.log(`   errorMsg: ${reconciliado.errorMsg}`);

    if (reconciliado.resultado !== ResultadoIntento.FALLO) {
      fail("Esperado FALLO, obtuvo " + reconciliado.resultado);
      return false;
    }
    const msg = reconciliado.errorMsg ?? "";
    if (!msg.includes("reapertura") && !msg.includes("REVISION_REQUERIDA")) {
      fail("El errorMsg debería mencionar reapertura o REVISION_REQUERIDA: " + msg);
      return false;
    }
    ok("Reapertura intermedia → FALLO con mensaje descriptivo");
    return true;
  } catch (e) {
    fail("Excepción en V2", e);
    return false;
  }
}

// ---------------------------------------------------------------------------
// V3 — Reconciliación sin cierre (período en ABIERTA)
// ---------------------------------------------------------------------------
async function V3(): Promise<boolean> {
  header("V3", "Reconciliación sin evidencia (período en ABIERTA)");
  try {
    const idH = await prepararPeriodo(
      new Date("2027-06-21"), new Date("2027-06-27"), true
    );
    console.log(`   Período H: ${idH}`);

    const hace1h    = new Date(Date.now() - 61 * 60_000);
    const intentoId = await insertarIntentoSimulado(idH, hace1h);
    console.log(`   Intento simulado: ${intentoId}`);

    const intentoObj  = await db.closureAttempt.findUniqueOrThrow({ where: { id: intentoId } });
    const reconciliado = await reconciliarIntentoAbandonado(intentoObj, idH);
    console.log(`   resultado: ${reconciliado.resultado}`);
    console.log(`   errorMsg: ${reconciliado.errorMsg}`);

    if (reconciliado.resultado !== ResultadoIntento.FALLO) {
      fail("Esperado FALLO, obtuvo " + reconciliado.resultado);
      return false;
    }
    if (!reconciliado.errorMsg?.toUpperCase().includes("ABIERTA")) {
      fail("El errorMsg debería mencionar ABIERTA: " + reconciliado.errorMsg);
      return false;
    }
    ok("Sin cierre (período ABIERTA) → FALLO con estado en mensaje");
    return true;
  } catch (e) {
    fail("Excepción en V3", e);
    return false;
  }
}

// ---------------------------------------------------------------------------
// V4 — Dos ejecuciones concurrentes: exactamente 1 pasa
// ---------------------------------------------------------------------------
async function V4(): Promise<boolean> {
  header("V4", "Concurrencia: dos ejecuciones simultáneas, exactamente 1 pasa");
  try {
    const idI = await prepararPeriodo(
      new Date("2027-06-28"), new Date("2027-07-04"), true
    );
    console.log(`   Período I: ${idI}`);

    const params = { weeklyPeriodId: idI, tipo: TipoCierre.AUTOMATICO, actorId: null };
    const [r1, r2] = await Promise.allSettled([
      ejecutarCierrePeriodo(params),
      ejecutarCierrePeriodo(params),
    ]);

    const exitosos = [r1, r2].filter(r => r.status === "fulfilled").length;
    const fallidos = [r1, r2].filter(r => r.status === "rejected").length;
    console.log(`   fulfilled: ${exitosos}, rejected: ${fallidos}`);

    if (exitosos !== 1 || fallidos !== 1) {
      fail(`Esperado 1/1. Got: ${exitosos} exitosos / ${fallidos} fallidos`);
      if (r1.status === "rejected") console.error("   r1 error:", r1.reason);
      if (r2.status === "rejected") console.error("   r2 error:", r2.reason);
      return false;
    }

    const intentos = await db.closureAttempt.findMany({ where: { weeklyPeriodId: idI } });
    const cierres  = await db.weeklyClosure.findMany({ where: { weeklyPeriodId: idI } });
    console.log(`   closure_attempts: ${intentos.length}, weekly_closures: ${cierres.length}`);

    if (intentos.length !== 1) {
      fail(`Esperado 1 intento, encontrado ${intentos.length}`);
      return false;
    }
    if (cierres.length !== 1) {
      fail(`Esperado 1 cierre, encontrado ${cierres.length}`);
      return false;
    }
    ok("Concurrencia resuelta: 1 intento y 1 cierre en BD");
    return true;
  } catch (e) {
    fail("Excepción en V4", e);
    return false;
  }
}

// ---------------------------------------------------------------------------
// V5 — Numeración consecutiva de intentos
// ---------------------------------------------------------------------------
async function V5(): Promise<boolean> {
  header("V5", "Numeración consecutiva de intentos tras reapertura");
  try {
    const idJ = await prepararPeriodo(
      new Date("2027-07-05"), new Date("2027-07-11"), true
    );
    console.log(`   Período J: ${idJ}`);

    // Intento 1 → cierra el período
    const r1 = await ejecutarCierrePeriodo({
      weeklyPeriodId: idJ,
      tipo: TipoCierre.AUTOMATICO,
      actorId: null,
    });
    console.log(`   Intento 1 — intentoNum=${r1.intento.intentoNum} resultado=${r1.intento.resultado}`);

    if (r1.intento.intentoNum !== 1) {
      fail(`Primer intentoNum esperado 1, obtuvo ${r1.intento.intentoNum}`);
      return false;
    }

    // Reabrir (estado REABIERTA)
    await reabrirPeriodo({
      weeklyPeriodId: idJ,
      adminId: ADMIN_ID,
      motivo: "Reapertura V5 test",
    });
    console.log("   Reapertura ejecutada → estado REABIERTA");

    // Verificar que nextIntentoNum sería 2
    const agg = await db.closureAttempt.aggregate({
      where: { weeklyPeriodId: idJ },
      _max: { intentoNum: true },
    });
    const nextNum = (agg._max.intentoNum ?? 0) + 1;
    console.log(`   MAX(intentoNum)=${agg._max.intentoNum} → próximo intentoNum: ${nextNum}`);

    if (nextNum !== 2) {
      fail(`Próximo intentoNum esperado 2, calculó ${nextNum}`);
      return false;
    }
    ok("Numeración consecutiva confirmada: intentoNum 1 → próximo 2");
    return true;
  } catch (e) {
    fail("Excepción en V5", e);
    return false;
  }
}

// ---------------------------------------------------------------------------
// V6 — Fases anteriores intactas
// ---------------------------------------------------------------------------
async function V6(): Promise<boolean> {
  header("V6", "Fases anteriores intactas");
  try {
    // 6a. Período 3.1 conserva exactamente 4 cierres
    const cierres31 = await db.weeklyClosure.findMany({
      where: { weeklyPeriodId: PERIODO_31_ID },
      orderBy: { version: "asc" },
    });
    console.log(`   Cierres período 3.1: ${cierres31.map(c => `v${c.version}`).join(", ")}`);
    if (cierres31.length !== 4) {
      fail(`Esperados 4 cierres en período 3.1, encontrados ${cierres31.length}`);
      return false;
    }
    ok("Período 3.1 conserva 4 cierres intactos");

    // 6b. getCurrentWeeklyPeriod devuelve período válido
    const actual = await getCurrentWeeklyPeriod();
    if (!actual?.id) {
      fail("getCurrentWeeklyPeriod devolvió null o sin id");
      return false;
    }
    console.log(`   Período actual: ${actual.id}`);
    console.log(`   Rango: ${actual.inicioSemana.toISOString().split("T")[0]} → ${actual.finSemana.toISOString().split("T")[0]}`);
    ok("getCurrentWeeklyPeriod retorna período válido");

    return true;
  } catch (e) {
    fail("Excepción en V6", e);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Runner principal
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  console.log("=".repeat(60));
  console.log("verify-attempt-fix.ts — Corrección Fase 3.2");
  console.log("=".repeat(60));

  const resultados: { v: string; ok: boolean }[] = [];

  for (const [v, fn] of [
    ["V1", V1],
    ["V2", V2],
    ["V3", V3],
    ["V4", V4],
    ["V5", V5],
    ["V6", V6],
  ] as Array<[string, () => Promise<boolean>]>) {
    const r = await fn();
    resultados.push({ v, ok: r });
  }

  console.log("\n" + "=".repeat(60));
  console.log("RESUMEN");
  console.log("=".repeat(60));
  for (const r of resultados) {
    console.log(`  ${r.ok ? "✅" : "❌"} ${r.v}`);
  }
  const passed = resultados.filter(r => r.ok).length;
  console.log(`\n${passed}/${resultados.length} verificaciones pasadas`);

  // Registros de prueba creados (NO se eliminan)
  console.log("\n── Registros de prueba creados (NO eliminados) ──────────────");
  console.log("   Períodos: 2027-06-07, 2027-06-14, 2027-06-21, 2027-06-28, 2027-07-05");
  console.log("   Buscar con: SELECT id, inicio_semana, estado FROM weekly_periods WHERE inicio_semana >= '2027-06-07'");

  if (passed < resultados.length) process.exit(1);
}

main()
  .catch((e) => { console.error("Error fatal:", e); process.exit(1); })
  .finally(() => db.$disconnect());
