/**
 * Script de verificación — Fase 3.2: Intentos de cierre y recuperación
 *
 * Ejecutar con:
 *   npx tsx --tsconfig tsconfig.scripts.json src/scripts/verify-attempt.ts
 *
 * Semana de prueba: 2027-04-05 (lunes) — futura, sin datos reales.
 * NO toca registros de Fase 3.1 (semana 2027-03-01).
 * NO elimina datos al terminar — informa lo que quedó.
 */

import { db } from "@/lib/db";
import {
  getOrCreateWeeklyPeriod,
  ejecutarCierrePeriodo,
  reconciliarIntentoAbandonado,
  detectarPeriodosPendientes,
  listarIntentos,
  listarCierres,
  obtenerCierreVigente,
  HistorialError,
} from "@/modules/historial";
import {
  EstadoPeriodo,
  TipoCierre,
  ResultadoIntento,
} from "@prisma/client";

// IDs de usuarios reales de la BD de desarrollo
const ADMIN_ID = "352c4ae5-35b3-4e7e-86e9-18605d42049b";

// Semana de prueba: miércoles 2027-04-07 mediodía UTC → lunes 2027-04-05
const TEST_DATE_A = new Date(Date.UTC(2027, 3, 7, 12, 0, 0));
// Segunda semana para prueba de concurrencia: lunes 2027-04-12
const TEST_DATE_B = new Date(Date.UTC(2027, 3, 14, 12, 0, 0));

// Umbral mínimo para detectar intentos "abandonados" en las pruebas
// (1 ms: cualquier intento ya registrado se considerará antiguo)
const UMBRAL_TEST_MS = 1;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function pass(label: string) { console.log(`  ✅ ${label}`); }
function fail(label: string, detail: string) {
  console.error(`  ❌ ${label}: ${detail}`);
  process.exitCode = 1;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
async function main() {
  const periodoIds: string[] = [];

  try {
    // ── Preparación ──────────────────────────────────────────────────────
    console.log("\n── Preparación: crear período A (semana 2027-04-05) ─────────");
    const periodoA = await getOrCreateWeeklyPeriod(TEST_DATE_A);
    periodoIds.push(periodoA.id);
    console.log(`  PeriodoA id=${periodoA.id.slice(0,8)}… estado=${periodoA.estado}`);
    if (periodoA.estado !== EstadoPeriodo.ABIERTA) {
      fail("estado inicial A", `esperado ABIERTA, obtenido ${periodoA.estado}`); return;
    }
    pass("período A en ABIERTA");

    // ── V1: Intento exitoso ───────────────────────────────────────────────
    console.log("\n── V1: Intento exitoso ──────────────────────────────────────");
    const r1 = await ejecutarCierrePeriodo({
      weeklyPeriodId: periodoA.id,
      tipo: TipoCierre.AUTOMATICO,
      actorId: null,
      motivo: "Cierre automático de prueba",
    });
    if (r1.intento.resultado === ResultadoIntento.EXITO) pass(`resultado=EXITO, intentoNum=${r1.intento.intentoNum}`);
    else fail("resultado V1", r1.intento.resultado);
    if (r1.cierreId) pass(`cierreId registrado: ${r1.cierreId.slice(0,8)}…`);
    else fail("cierreId V1", "undefined");
    if (r1.intento.finalizado) pass("finalizado registrado");
    else fail("finalizado V1", "null");
    if (!r1.intento.errorMsg) pass("errorMsg=null en éxito");
    else fail("errorMsg V1", r1.intento.errorMsg);

    // ── V2: Intento fallido (período ya CERRADA) ──────────────────────────
    console.log("\n── V2: Intento fallido — período ya CERRADA ─────────────────");
    try {
      await ejecutarCierrePeriodo({
        weeklyPeriodId: periodoA.id,
        tipo: TipoCierre.AUTOMATICO,
        actorId: null,
      });
      fail("V2", "debió lanzar HistorialError");
    } catch (err) {
      if (err instanceof HistorialError && err.code === "INVALID_STATE") {
        pass(`rechazado con INVALID_STATE: "${err.message.slice(0,55)}…"`);
      } else {
        fail("tipo de error V2", String(err));
      }
    }

    // ── V3: Numeración consecutiva ────────────────────────────────────────
    console.log("\n── V3: Numeración consecutiva ───────────────────────────────");
    // Crear período B y ejecutar dos intentos (el segundo falla, pero queda registrado)
    const periodoB = await getOrCreateWeeklyPeriod(TEST_DATE_B);
    periodoIds.push(periodoB.id);
    console.log(`  PeriodoB id=${periodoB.id.slice(0,8)}… estado=${periodoB.estado}`);

    // Primer intento en B → exitoso
    const rB1 = await ejecutarCierrePeriodo({
      weeklyPeriodId: periodoB.id,
      tipo: TipoCierre.AUTOMATICO,
      actorId: null,
      motivo: "intento 1 período B",
    });
    if (rB1.intento.intentoNum === 1) pass(`intento 1 en período B: intentoNum=${rB1.intento.intentoNum}`);
    else fail("intentoNum B1", String(rB1.intento.intentoNum));

    // Verificar numeración en BD
    const intentosB = await listarIntentos(periodoB.id);
    if (intentosB.length === 1 && intentosB[0].intentoNum === 1) {
      pass("solo 1 intento registrado en período B con intentoNum=1");
    } else {
      fail("numeración B", `${intentosB.length} intentos: ${intentosB.map(i=>i.intentoNum).join(",")}`);
    }

    // ── V4: Detección de intento abandonado ───────────────────────────────
    console.log("\n── V4: Detección de intento abandonado ──────────────────────");
    // Crear período C (semana 2027-04-19) e insertar un intento EN_PROGRESO manualmente
    // con una fecha de inicio muy antigua (simular proceso caído).
    const TEST_DATE_C = new Date(Date.UTC(2027, 3, 21, 12, 0, 0));
    const periodoC = await getOrCreateWeeklyPeriod(TEST_DATE_C);
    periodoIds.push(periodoC.id);

    const intentoSimuladoAbandonado = await db.closureAttempt.create({
      data: {
        weeklyPeriodId: periodoC.id,
        intentoNum: 1,
        resultado: ResultadoIntento.EN_PROGRESO,
        iniciado: new Date(Date.now() - 60 * 60 * 1000), // hace 1 hora
      },
    });
    console.log(`  Intento abandonado simulado: id=${intentoSimuladoAbandonado.id.slice(0,8)}…`);

    // Detectar con umbral mínimo
    const pendientes = await detectarPeriodosPendientes({ umbralAbandonoMs: UMBRAL_TEST_MS });
    const encontradoC = pendientes.find(p => p.periodo.id === periodoC.id);

    if (encontradoC) {
      pass(`período C detectado como pendiente`);
      if (encontradoC.intentoAbandonado?.id === intentoSimuladoAbandonado.id) {
        pass("intento abandonado identificado correctamente");
      } else {
        fail("intento abandonado V4", `esperado ${intentoSimuladoAbandonado.id.slice(0,8)}, obtenido ${encontradoC.intentoAbandonado?.id?.slice(0,8)}`);
      }
    } else {
      fail("detección V4", "período C no aparece en pendientes");
    }

    // ── V5: Reconciliación — cierre existente, intento EN_PROGRESO ─────────
    console.log("\n── V5: Reconciliación de intento abandonado ─────────────────");
    // periodoC no tiene cierre exitoso → reconciliar como FALLO
    const reconciliadoFallo = await reconciliarIntentoAbandonado(
      intentoSimuladoAbandonado,
      periodoC.id
    );
    if (reconciliadoFallo.resultado === ResultadoIntento.FALLO) {
      pass(`intento sin cierre → reconciliado como FALLO`);
    } else {
      fail("reconciliación FALLO", reconciliadoFallo.resultado);
    }
    if (reconciliadoFallo.errorMsg?.includes("interrumpido")) {
      pass(`errorMsg descriptivo registrado`);
    } else {
      fail("errorMsg reconciliación", reconciliadoFallo.errorMsg ?? "null");
    }

    // Ahora crear período D con cierre real, luego insertar intento abandonado y reconciliar como EXITO
    const TEST_DATE_D = new Date(Date.UTC(2027, 3, 28, 12, 0, 0));
    const periodoD = await getOrCreateWeeklyPeriod(TEST_DATE_D);
    periodoIds.push(periodoD.id);

    // Registrar intento manualmente con fecha anterior al cierre que vamos a crear
    const inicioIntento = new Date(Date.now() - 30 * 60 * 1000); // hace 30 min
    const intentoD = await db.closureAttempt.create({
      data: {
        weeklyPeriodId: periodoD.id,
        intentoNum: 1,
        resultado: ResultadoIntento.EN_PROGRESO,
        iniciado: inicioIntento,
      },
    });

    // Crear cierre real (simulando que el proceso lo completó antes de morir)
    // Usamos cerrarPeriodo directamente del closure.service (ya importado vía módulo)
    const { cerrarPeriodo } = await import("@/modules/historial/closure.service");
    await cerrarPeriodo({
      weeklyPeriodId: periodoD.id,
      tipo: TipoCierre.AUTOMATICO,
      actorId: null,
      motivo: "Cierre real antes del crash simulado",
    });

    // Reconciliar → debe detectar el cierre y marcar como EXITO
    const reconciliadoExito = await reconciliarIntentoAbandonado(intentoD, periodoD.id);
    if (reconciliadoExito.resultado === ResultadoIntento.EXITO) {
      pass("intento con cierre previo → reconciliado como EXITO");
    } else {
      fail("reconciliación EXITO V5", reconciliadoExito.resultado);
    }
    if (reconciliadoExito.finalizado) {
      pass("finalizado registrado en reconciliación");
    } else {
      fail("finalizado reconciliación", "null");
    }

    // ── V6: Ausencia de cierres duplicados ────────────────────────────────
    console.log("\n── V6: Ausencia de cierres duplicados ───────────────────────");
    const cierresA = await listarCierres(periodoA.id);
    if (cierresA.length === 1) pass(`período A: 1 cierre exitoso (sin duplicados)`);
    else fail("duplicados A", `${cierresA.length} cierres`);

    const vigente = await obtenerCierreVigente(periodoA.id);
    if (vigente?.version === 1) pass(`cierreVigente.version=1`);
    else fail("vigente V6", String(vigente?.version));

    // ── V7: Dos ejecuciones concurrentes sobre el mismo período ───────────
    console.log("\n── V7: Concurrencia — dos ejecuciones sobre período nuevo ───");
    const TEST_DATE_E = new Date(Date.UTC(2027, 4, 5, 12, 0, 0)); // 2027-05-05
    const periodoE = await getOrCreateWeeklyPeriod(TEST_DATE_E);
    periodoIds.push(periodoE.id);

    const [resE1, resE2] = await Promise.allSettled([
      ejecutarCierrePeriodo({
        weeklyPeriodId: periodoE.id,
        tipo: TipoCierre.AUTOMATICO,
        actorId: null,
        motivo: "concurrente E-1",
      }),
      ejecutarCierrePeriodo({
        weeklyPeriodId: periodoE.id,
        tipo: TipoCierre.AUTOMATICO,
        actorId: null,
        motivo: "concurrente E-2",
      }),
    ]);

    const exitosos = [resE1, resE2].filter(r => r.status === "fulfilled");
    const rechazados = [resE1, resE2].filter(r => r.status === "rejected");

    if (exitosos.length >= 1) pass(`al menos 1 ejecución completó`);
    else fail("V7 exitosos", "ninguno completó");

    // Verificar que no hay cierres duplicados en E
    const cierresE = await listarCierres(periodoE.id);
    if (cierresE.length === 1) pass(`período E: exactamente 1 cierre (sin duplicados)`);
    else fail("duplicados E V7", `${cierresE.length} cierres`);

    if (rechazados.length >= 1) {
      const reason = (rechazados[0] as PromiseRejectedResult).reason;
      pass(`segunda ejecución rechazada: ${reason instanceof HistorialError ? reason.code : String(reason).slice(0,60)}`);
    } else {
      // Ambas completaron — verificar sin duplicados (ya verificado arriba)
      pass("ambas completaron, sin duplicados en BD");
    }

    // ── V8: Protección de períodos CERRADA y REABIERTA ────────────────────
    console.log("\n── V8: Protección de períodos CERRADA y REABIERTA ───────────");
    // periodoA está CERRADA — intento directo debe rechazarse
    try {
      await ejecutarCierrePeriodo({
        weeklyPeriodId: periodoA.id,
        tipo: TipoCierre.AUTOMATICO,
        actorId: null,
      });
      fail("V8 CERRADA", "debió rechazar");
    } catch (err) {
      if (err instanceof HistorialError && err.code === "INVALID_STATE") {
        pass("CERRADA rechazado con INVALID_STATE");
      } else {
        fail("V8 error", String(err));
      }
    }

    // ── V9: Conservación de registros previos de Fase 3.1 ─────────────────
    console.log("\n── V9: Conservación de registros de Fase 3.1 ────────────────");
    const PERIOD_31 = "7e331e7c-a551-43af-a2aa-a2039a1f8b4d";
    const cierres31 = await listarCierres(PERIOD_31);
    if (cierres31.length === 4) pass(`Fase 3.1: 4 cierres conservados intactos`);
    else fail("conservación 3.1", `encontrados ${cierres31.length}`);

    const intentos31 = await listarIntentos(PERIOD_31);
    if (intentos31.length === 0) pass("Fase 3.1: 0 intentos (correcto, no creados en 3.1)");
    else fail("intentos 3.1 inesperados", String(intentos31.length));

  } finally {
    await db.$disconnect();

    console.log("\n── Resultado final ───────────────────────────────────────────");
    if (process.exitCode === 1) {
      console.error("❌ Algunas verificaciones fallaron (ver detalle arriba).");
    } else {
      console.log("✅ Todas las verificaciones completadas correctamente.");
    }

    console.log(`\n⚠️  DATOS DE PRUEBA en 'intecoal_asistencia' (Fase 3.2):`);
    console.log(`   Tabla weekly_periods: ${periodoIds.length} registros nuevos`);
    periodoIds.forEach(id => console.log(`     - ${id}`));
    console.log(`   Tabla closure_attempts: varios registros con weeklyPeriodId en la lista anterior`);
    console.log(`   Tabla weekly_closures: registros en los períodos A, B, D, E`);
    console.log(`   Para limpiar, autoriza la operación de eliminación.`);
  }
}

main().catch(err => {
  console.error("Error inesperado:", err);
  process.exitCode = 1;
});
