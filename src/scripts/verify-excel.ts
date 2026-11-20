/**
 * verify-excel.ts — Verificación Fase 9: Exportación Excel
 *
 * Prueba los 4 endpoints de exportación comprobando:
 * - HTTP 200 con Content-Type correcto
 * - Tamaño de archivo > 0
 * - Content-Disposition con nombre de archivo .xlsx
 * - Permisos: sin sesión → 401
 * - Validaciones: parámetros inválidos → 400
 * - Período sin datos → 404
 */

import jwt from "jsonwebtoken";
import { db } from "@/lib/db";
import { writeFileSync } from "fs";
import { join } from "path";

const ADMIN_ID = "352c4ae5-35b3-4e7e-86e9-18605d42049b";
const BASE = "http://localhost:3000";

let passed = 0;
let failed = 0;

function ok(label: string) { console.log(`  ✅ ${label}`); passed++; }
function fail(label: string, detail?: unknown) {
  console.log(`  ❌ ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`);
  failed++;
}
function assert(cond: boolean, label: string, detail?: unknown) {
  cond ? ok(label) : fail(label, detail);
}

function makeCookie(userId: string, role: string) {
  const token = jwt.sign({ sub: userId, role }, process.env.NEXTAUTH_SECRET!, { expiresIn: "1h" });
  return `session=${encodeURIComponent(token)}`;
}

async function checkExport(label: string, url: string, cookie: string, expectedStatus = 200) {
  console.log(`\n${label}`);
  const res = await fetch(`${BASE}${url}`, { headers: { cookie } });
  assert(res.status === expectedStatus, `HTTP ${expectedStatus} — recibido ${res.status}`);

  if (res.status === 200) {
    const ct = res.headers.get("content-type") ?? "";
    assert(ct.includes("spreadsheetml"), `Content-Type xlsx — recibido: ${ct}`);

    const cd = res.headers.get("content-disposition") ?? "";
    assert(cd.includes(".xlsx"), `Content-Disposition incluye .xlsx — recibido: ${cd}`);

    const buffer = await res.arrayBuffer();
    assert(buffer.byteLength > 1000, `Tamaño > 1 KB — recibido: ${buffer.byteLength} bytes`);

    // Guardar archivo para inspección manual
    const filename = cd.match(/filename="(.+?)"/)?.[1] ?? "output.xlsx";
    const outPath  = join("src", "scripts", filename);
    writeFileSync(outPath, Buffer.from(buffer));
    ok(`Archivo guardado en ${outPath}`);
  } else {
    await res.body?.cancel();
  }
}

async function main() {
  console.log("=".repeat(60));
  console.log("Verificación Fase 9 — Exportación Excel");
  console.log("=".repeat(60));

  const cookie   = makeCookie(ADMIN_ID, "ADMIN");

  // Buscar un período con consolidados
  const cierre = await db.weeklyClosure.findFirst({
    where: { exitoso: true, consolidados: { some: {} } },
    orderBy: { version: "desc" },
    include: { weeklyPeriod: true },
  });

  if (!cierre) {
    console.log("⚠️ No hay cierres con consolidados. Ejecuta fases anteriores primero.");
    await db.$disconnect();
    return;
  }

  const pid   = cierre.weeklyPeriodId;
  const ini   = cierre.weeklyPeriod.inicioSemana;
  const anio  = ini.getUTCFullYear();
  const mes   = ini.getUTCMonth() + 1;
  const fecha = ini.toISOString().split("T")[0];

  console.log(`\nUsando período ${pid} (inicio: ${fecha})`);

  // ── E1: Exportar semanal por weeklyPeriodId ─────────────────────────────
  await checkExport(
    "E1 — Semanal por weeklyPeriodId",
    `/api/historial/exportar/semana?weeklyPeriodId=${pid}`,
    cookie
  );

  // ── E2: Exportar semanal por fecha ──────────────────────────────────────
  await checkExport(
    "E2 — Semanal por fecha",
    `/api/historial/exportar/semana?fecha=${fecha}`,
    cookie
  );

  // ── E3: Exportar mensual ─────────────────────────────────────────────────
  await checkExport(
    `E3 — Mensual (${anio}/${mes})`,
    `/api/historial/exportar/mes?anio=${anio}&mes=${mes}`,
    cookie
  );

  // ── E4: Exportar anual ───────────────────────────────────────────────────
  await checkExport(
    `E4 — Anual (${anio})`,
    `/api/historial/exportar/anio?anio=${anio}`,
    cookie
  );

  // ── E5: Exportar empleado individual ────────────────────────────────────
  await checkExport(
    "E5 — Empleado individual (ADMIN_ID)",
    `/api/historial/exportar/empleado?userId=${ADMIN_ID}&anio=${anio}`,
    cookie
  );

  // ── P1: Sin sesión → 401 ────────────────────────────────────────────────
  console.log("\nP1 — Sin sesión → 401");
  const r401 = await fetch(`${BASE}/api/historial/exportar/semana?weeklyPeriodId=${pid}`);
  assert(r401.status === 401, `HTTP 401 — recibido ${r401.status}`);
  await r401.body?.cancel();

  // ── V1: Sin parámetros → 400 ─────────────────────────────────────────────
  console.log("\nV1 — Sin parámetros en /exportar/semana → 400");
  const rv1 = await fetch(`${BASE}/api/historial/exportar/semana`, { headers: { cookie } });
  assert(rv1.status === 400, `HTTP 400 — recibido ${rv1.status}`);
  await rv1.body?.cancel();

  // ── V2: Período inexistente → 404 ────────────────────────────────────────
  console.log("\nV2 — Período inexistente → 404");
  const rv2 = await fetch(`${BASE}/api/historial/exportar/semana?weeklyPeriodId=no-existe`, { headers: { cookie } });
  assert(rv2.status === 404, `HTTP 404 — recibido ${rv2.status}`);
  await rv2.body?.cancel();

  // ── V3: Mes inválido → 400 ───────────────────────────────────────────────
  console.log("\nV3 — Mes inválido → 400");
  const rv3 = await fetch(`${BASE}/api/historial/exportar/mes?anio=2027&mes=13`, { headers: { cookie } });
  assert(rv3.status === 400, `HTTP 400 — recibido ${rv3.status}`);
  await rv3.body?.cancel();

  // ── V4: Usuario inexistente → 404 ────────────────────────────────────────
  console.log("\nV4 — Usuario inexistente → 404");
  const rv4 = await fetch(`${BASE}/api/historial/exportar/empleado?userId=no-existe`, { headers: { cookie } });
  assert(rv4.status === 404, `HTTP 404 — recibido ${rv4.status}`);
  await rv4.body?.cancel();

  await db.$disconnect();

  console.log("\n" + "=".repeat(60));
  console.log(`Resultado: ${passed} pasaron / ${failed} fallaron`);
  console.log("=".repeat(60));
  if (failed > 0) process.exit(1);
}

main().catch(e => {
  console.error(e);
  db.$disconnect();
  process.exit(1);
});
