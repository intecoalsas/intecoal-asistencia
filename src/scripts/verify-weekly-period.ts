/**
 * Script de verificación — Fase 2: Gestión de períodos semanales
 *
 * Ejecutar con:
 *   npx tsx src/scripts/verify-weekly-period.ts
 *
 * Verifica:
 *  V1. Semana normal (miércoles → lunes de esa semana)
 *  V2. Cambio de mes (última semana de un mes / primera del siguiente)
 *  V3. Cambio de año (última semana de diciembre / primera de enero)
 *  V4. Domingo → mismo lunes que el lunes siguiente
 *  V5. Lunes → mismo resultado que cualquier día de esa semana
 *  V6. Idempotencia — solicitudes repetidas devuelven el mismo id
 *  V7. Período existente conserva su estado (no se reinicia)
 *  V8. Integración real con BD — crear y recuperar
 *
 * Las verificaciones V1–V5 son puramente de lógica (sin BD).
 * Las verificaciones V6–V8 requieren conexión a la BD de desarrollo.
 */

import {
  calcularRangoSemana,
  getInicioSemana,
  getFinSemana,
  getOrCreateWeeklyPeriod,
  findWeeklyPeriod,
} from "@/modules/historial/weekly-period.service";
import { db } from "@/lib/db";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isoDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

/**
 * Construye un Date a mediodía UTC del día calendario indicado.
 * Se usa mediodía (12:00 UTC) y no medianoche (00:00 UTC) porque la función
 * getInicioSemana convierte el instante a zona Bogotá (UTC-5) para determinar
 * el día laboral: las 00:00 UTC = 19:00 del día ANTERIOR en Bogotá, lo que
 * desplazaría el día en todos los casos de prueba.
 * El módulo en producción siempre recibe instantes reales (new Date() ≈ mediodía
 * o cualquier hora del día), nunca medianoche UTC como fecha simbólica.
 */
function utcDate(year: number, month: number, day: number): Date {
  // 12:00 UTC siempre es 07:00 Bogotá (UTC-5) → mismo día calendario
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

function pass(label: string) {
  console.log(`  ✅ ${label}`);
}

function fail(label: string, detail: string) {
  console.error(`  ❌ ${label}: ${detail}`);
  process.exitCode = 1;
}

function assert(label: string, actual: string, expected: string) {
  if (actual === expected) {
    pass(`${label} → ${actual}`);
  } else {
    fail(label, `esperado ${expected}, obtenido ${actual}`);
  }
}

// ---------------------------------------------------------------------------
// V1–V5: Verificaciones de lógica de cálculo (sin BD)
// ---------------------------------------------------------------------------

console.log("\n── V1: Semana normal ─────────────────────────────────────────");
{
  // Miércoles 2025-03-05 → semana 2025-03-03 (lun) a 2025-03-09 (dom)
  const d = utcDate(2025, 3, 5);
  const { inicioSemana, finSemana } = calcularRangoSemana(d);
  assert("inicio semana (mié 2025-03-05)", isoDate(inicioSemana), "2025-03-03");
  assert("fin semana (mié 2025-03-05)",   isoDate(finSemana),    "2025-03-09");
}

console.log("\n── V2: Cambio de mes ─────────────────────────────────────────");
{
  // Viernes 2025-02-28 → semana 2025-02-24 (lun) a 2025-03-02 (dom)
  const d = utcDate(2025, 2, 28);
  const { inicioSemana, finSemana } = calcularRangoSemana(d);
  assert("inicio semana (vie 2025-02-28)", isoDate(inicioSemana), "2025-02-24");
  assert("fin semana (vie 2025-02-28)",    isoDate(finSemana),    "2025-03-02");
}
{
  // Lunes 2025-03-03 → misma semana que el viernes anterior
  const d = utcDate(2025, 3, 3);
  const { inicioSemana } = calcularRangoSemana(d);
  assert("inicio semana (lun 2025-03-03 — nueva semana)", isoDate(inicioSemana), "2025-03-03");
}

console.log("\n── V3: Cambio de año ─────────────────────────────────────────");
{
  // Miércoles 2025-01-01 → semana 2024-12-30 (lun) a 2026-01-05 (dom)
  const d = utcDate(2025, 1, 1);
  const { inicioSemana, finSemana } = calcularRangoSemana(d);
  assert("inicio semana (2025-01-01)", isoDate(inicioSemana), "2024-12-30");
  assert("fin semana (2025-01-01)",    isoDate(finSemana),    "2025-01-05");
}
{
  // Lunes 2025-01-06 → nueva semana
  const d = utcDate(2025, 1, 6);
  const { inicioSemana } = calcularRangoSemana(d);
  assert("inicio semana (lun 2025-01-06)", isoDate(inicioSemana), "2025-01-06");
}

console.log("\n── V4: Domingo y lunes consecutivos en semanas distintas ─────");
{
  // Domingo 2025-03-09 → semana 2025-03-03 a 2025-03-09
  const dom = utcDate(2025, 3, 9);
  const { inicioSemana: inicioD, finSemana: finD } = calcularRangoSemana(dom);
  assert("inicio semana (dom 2025-03-09)", isoDate(inicioD), "2025-03-03");
  assert("fin semana (dom 2025-03-09)",    isoDate(finD),    "2025-03-09");

  // Lunes 2025-03-10 → semana 2025-03-10 a 2025-03-16
  const lun = utcDate(2025, 3, 10);
  const { inicioSemana: inicioL, finSemana: finL } = calcularRangoSemana(lun);
  assert("inicio semana (lun 2025-03-10)", isoDate(inicioL), "2025-03-10");
  assert("fin semana (lun 2025-03-10)",    isoDate(finL),    "2025-03-16");

  // Verificar que son semanas distintas
  if (isoDate(inicioD) !== isoDate(inicioL)) {
    pass("dom 2025-03-09 y lun 2025-03-10 están en semanas distintas");
  } else {
    fail("semanas distintas", "dom y lun siguiente deben tener distinto inicio");
  }
}

console.log("\n── V5: Consistencia — todos los días de una semana → mismo inicio ─");
{
  const semana = ["2025-03-03","2025-03-04","2025-03-05","2025-03-06","2025-03-07","2025-03-08","2025-03-09"];
  const inicios = semana.map(s => {
    const [y,m,d] = s.split("-").map(Number);
    return isoDate(getInicioSemana(utcDate(y,m,d)));
  });
  const unique = [...new Set(inicios)];
  if (unique.length === 1 && unique[0] === "2025-03-03") {
    pass(`los 7 días de la semana 2025-03-03 tienen inicio = ${unique[0]}`);
  } else {
    fail("consistencia semana", `se obtuvieron ${unique.length} inicios distintos: ${unique.join(", ")}`);
  }
}

// ---------------------------------------------------------------------------
// V6–V8: Verificaciones con BD real
// ---------------------------------------------------------------------------

console.log("\n── V6: Idempotencia — solicitudes repetidas ──────────────────");
async function runDbTests() {
  try {
    // Usamos una fecha de prueba futura para no colisionar con datos reales:
    // semana del 2026-06-01 (lunes)
    const testDate = utcDate(2026, 6, 3); // miércoles de esa semana

    const p1 = await getOrCreateWeeklyPeriod(testDate);
    const p2 = await getOrCreateWeeklyPeriod(testDate);
    if (p1.id === p2.id) {
      pass(`idempotencia: mismo id="${p1.id.slice(0,8)}…" en dos llamadas`);
    } else {
      fail("idempotencia", `ids distintos: ${p1.id} vs ${p2.id}`);
    }

    console.log("\n── V7: Período existente conserva su estado ──────────────────");
    // El período ya existe (creado en V6). Verificar que el estado no fue alterado.
    const pCheck = await findWeeklyPeriod(testDate);
    if (!pCheck) {
      fail("conserva estado", "período no encontrado tras crear");
    } else {
      assert("estado del período", pCheck.estado, "ABIERTA");
      assert("inicio correcto",    isoDate(pCheck.inicioSemana), "2026-06-01");
      assert("fin correcto",       isoDate(pCheck.finSemana),    "2026-06-07");
    }

    console.log("\n── V8: Concurrencia — dos peticiones simultáneas ─────────────");
    // Usamos otra fecha distinta para simular dos peticiones simultáneas
    const concDate = utcDate(2026, 7, 15); // miércoles 2026-07-15
    const [r1, r2] = await Promise.all([
      getOrCreateWeeklyPeriod(concDate),
      getOrCreateWeeklyPeriod(concDate),
    ]);
    if (r1.id === r2.id) {
      pass(`concurrencia resuelta: ambas peticiones obtuvieron id="${r1.id.slice(0,8)}…"`);
    } else {
      fail("concurrencia", `ids distintos: ${r1.id} vs ${r2.id}`);
    }

    // Limpiar registros de prueba para no contaminar la BD
    // La limpieza usa medianoche UTC porque coincide con como getInicioSemana
    // almacena los valores (Date.UTC con hora 0).
    await db.weeklyPeriod.deleteMany({
      where: {
        inicioSemana: {
          in: [
            new Date(Date.UTC(2026, 5, 1)),  // 2026-06-01 medianoche UTC
            new Date(Date.UTC(2026, 6, 13)), // 2026-07-13 medianoche UTC
          ],
        },
      },
    });
    pass("registros de prueba eliminados de la BD");

  } catch (err) {
    console.error("\n  ⚠️  Error en pruebas de BD:", (err as Error).message);
    console.error("     Las pruebas V6-V8 requieren conexión activa a intecoal_asistencia.");
    process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}

runDbTests().then(() => {
  console.log("\n── Resultado final ───────────────────────────────────────────");
  if (process.exitCode === 1) {
    console.error("❌ Algunas verificaciones fallaron (ver detalle arriba).");
  } else {
    console.log("✅ Todas las verificaciones completadas correctamente.");
  }
});
