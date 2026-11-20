/**
 * Verificaciones Fase 7 — API del Historial
 *
 * Prueba los 5 endpoints mediante fetch directo al servidor Next.js local
 * levantado en http://localhost:3000.
 *
 * Precondiciones:
 *   - El servidor Next.js debe estar corriendo (`next dev` o `next start`).
 *   - Debe existir una cookie de sesión ADMIN válida en ADMIN_SESSION.
 *   - Deben existir datos de semanas consolidadas de las fases anteriores.
 *
 * Uso:
 *   npx tsx --tsconfig tsconfig.scripts.json src/scripts/verify-historial-api.ts
 */

import { db } from "@/lib/db";
import jwt from "jsonwebtoken";

// ─── Constantes ──────────────────────────────────────────────────────────────

const ADMIN_ID = "352c4ae5-35b3-4e7e-86e9-18605d42049b";
const SV_ID    = "09cb2496-4922-4fcd-a4a7-60a93afc5039";
const BASE_URL = "http://localhost:3000";

// ─── Helpers ─────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function ok(label: string) {
  console.log(`  ✅ ${label}`);
  passed++;
}

function fail(label: string, detail?: unknown) {
  console.log(`  ❌ ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`);
  failed++;
}

function assert(condition: boolean, label: string, detail?: unknown) {
  condition ? ok(label) : fail(label, detail);
}

function makeSessionCookie(userId: string, role: string): string {
  const secret = process.env.NEXTAUTH_SECRET!;
  const token = jwt.sign({ sub: userId, role }, secret, { expiresIn: "1h" });
  return `session=${token}`;
}

async function get(
  path: string,
  cookie: string
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { cookie },
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

// ─── Pruebas ─────────────────────────────────────────────────────────────────

async function main() {
  console.log("=".repeat(60));
  console.log("Verificaciones Fase 7 — API del Historial");
  console.log("=".repeat(60));

  const adminCookie = makeSessionCookie(ADMIN_ID, "ADMIN");
  const svCookie    = makeSessionCookie(SV_ID, "SUPERVISOR");

  // Buscar un período consolidado existente para las pruebas
  // (debe tener consolidados para que consultarSemana devuelva datos)
  const primerCierreExitoso = await db.weeklyClosure.findFirst({
    where: { exitoso: true, consolidados: { some: {} } },
    orderBy: { version: "desc" },
    include: { weeklyPeriod: true },
  });

  if (!primerCierreExitoso) {
    console.log("⚠️  No hay cierres con consolidados en BD. Ejecuta las fases anteriores primero.");
    await db.$disconnect();
    return;
  }

  const periodoId   = primerCierreExitoso.weeklyPeriodId;
  const inicioSemana = primerCierreExitoso.weeklyPeriod.inicioSemana;
  const fechaStr = inicioSemana.toISOString().split("T")[0]; // YYYY-MM-DD
  const anio = inicioSemana.getUTCFullYear();
  const mes  = inicioSemana.getUTCMonth() + 1;

  console.log(`\nUsando período: ${periodoId} (inicio: ${fechaStr})`);

  // ── A1: GET /api/historial/semana/:id ─────────────────────────────────────
  console.log("\nA1 — GET /api/historial/semana/:weeklyPeriodId (ADMIN)");
  {
    const { status, body } = await get(
      `/api/historial/semana/${periodoId}`,
      adminCookie
    );
    assert(status === 200, `HTTP 200 — recibido ${status}`);
    const b = body as Record<string, unknown>;
    assert(!!b?.data, "body.data presente");
    const data = b?.data as Record<string, unknown>;
    assert(data?.weeklyPeriodId === periodoId, "weeklyPeriodId correcto");
    assert(typeof data?.version === "number", "version es número");
    assert(!data?.detalle, "sin detalle por defecto");
  }

  // ── A2: detalle=true ──────────────────────────────────────────────────────
  console.log("\nA2 — GET /api/historial/semana/:id?detalle=true");
  {
    const { status, body } = await get(
      `/api/historial/semana/${periodoId}?detalle=true`,
      adminCookie
    );
    assert(status === 200, `HTTP 200 — recibido ${status}`);
    const data = (body as Record<string, unknown>)?.data as Record<string, unknown>;
    assert(Array.isArray(data?.detalle), "detalle es array");
    const detalle = data?.detalle as unknown[];
    assert(detalle.length > 0, `detalle tiene filas — ${detalle.length}`);
  }

  // ── A3: período inexistente ───────────────────────────────────────────────
  console.log("\nA3 — Período inexistente → 404");
  {
    const { status } = await get(
      `/api/historial/semana/periodo-inexistente-xyz`,
      adminCookie
    );
    assert(status === 404, `HTTP 404 — recibido ${status}`);
  }

  // ── A4: SUPERVISOR puede consultar ────────────────────────────────────────
  console.log("\nA4 — SUPERVISOR puede consultar semana");
  {
    const { status } = await get(
      `/api/historial/semana/${periodoId}`,
      svCookie
    );
    assert(status === 200, `HTTP 200 — recibido ${status}`);
  }

  // ── A5: Sin sesión → 401 ─────────────────────────────────────────────────
  console.log("\nA5 — Sin sesión → 401");
  {
    const { status } = await get(`/api/historial/semana/${periodoId}`, "");
    assert(status === 401, `HTTP 401 — recibido ${status}`);
  }

  // ── B1: GET /api/historial/semana/por-fecha ───────────────────────────────
  console.log("\nB1 — GET /api/historial/semana/por-fecha?fecha=YYYY-MM-DD");
  {
    const { status, body } = await get(
      `/api/historial/semana/por-fecha?fecha=${fechaStr}`,
      adminCookie
    );
    assert(status === 200, `HTTP 200 — recibido ${status}`);
    const data = (body as Record<string, unknown>)?.data as Record<string, unknown>;
    assert(!!data, "body.data presente");
    assert(data?.weeklyPeriodId === periodoId, "weeklyPeriodId correcto");
  }

  // ── B2: Parámetro faltante → 400 ─────────────────────────────────────────
  console.log("\nB2 — Sin parámetro fecha → 400");
  {
    const { status } = await get(`/api/historial/semana/por-fecha`, adminCookie);
    assert(status === 400, `HTTP 400 — recibido ${status}`);
  }

  // ── B3: Formato inválido → 400 ────────────────────────────────────────────
  console.log("\nB3 — Formato fecha inválido → 400");
  {
    const { status } = await get(
      `/api/historial/semana/por-fecha?fecha=18-11-2027`,
      adminCookie
    );
    assert(status === 400, `HTTP 400 — recibido ${status}`);
  }

  // ── B4: Fecha sin período → data null ────────────────────────────────────
  console.log("\nB4 — Fecha sin período consolidado → data null");
  {
    const { status, body } = await get(
      `/api/historial/semana/por-fecha?fecha=1999-01-01`,
      adminCookie
    );
    assert(status === 200, `HTTP 200 — recibido ${status}`);
    const b = body as Record<string, unknown>;
    assert(b?.data === null, "data = null para fecha sin período");
  }

  // ── C1: GET /api/historial/mes ────────────────────────────────────────────
  console.log(`\nC1 — GET /api/historial/mes?anio=${anio}&mes=${mes}`);
  {
    const { status, body } = await get(
      `/api/historial/mes?anio=${anio}&mes=${mes}`,
      adminCookie
    );
    assert(status === 200, `HTTP 200 — recibido ${status}`);
    const data = (body as Record<string, unknown>)?.data as Record<string, unknown>;
    assert(data?.anio === anio, `anio = ${anio}`);
    assert(data?.mes  === mes,  `mes = ${mes}`);
    assert(Array.isArray(data?.semanas), "semanas es array");
  }

  // ── C2: Mes inválido → 400 ───────────────────────────────────────────────
  console.log("\nC2 — Mes inválido (13) → 400");
  {
    const { status } = await get(
      `/api/historial/mes?anio=${anio}&mes=13`,
      adminCookie
    );
    assert(status === 400, `HTTP 400 — recibido ${status}`);
  }

  // ── C3: Año fuera de rango → 400 ─────────────────────────────────────────
  console.log("\nC3 — Año fuera de rango → 400");
  {
    const { status } = await get(
      `/api/historial/mes?anio=1800&mes=1`,
      adminCookie
    );
    assert(status === 400, `HTTP 400 — recibido ${status}`);
  }

  // ── C4: Parámetros faltantes → 400 ───────────────────────────────────────
  console.log("\nC4 — Sin parámetros → 400");
  {
    const { status } = await get(`/api/historial/mes`, adminCookie);
    assert(status === 400, `HTTP 400 — recibido ${status}`);
  }

  // ── D1: GET /api/historial/anio ───────────────────────────────────────────
  console.log(`\nD1 — GET /api/historial/anio?anio=${anio}`);
  {
    const { status, body } = await get(
      `/api/historial/anio?anio=${anio}`,
      adminCookie
    );
    assert(status === 200, `HTTP 200 — recibido ${status}`);
    const data = (body as Record<string, unknown>)?.data as Record<string, unknown>;
    assert(data?.anio === anio, `anio = ${anio}`);
    const meses = data?.meses as unknown[];
    assert(Array.isArray(meses) && meses.length === 12, `12 meses — ${meses?.length}`);
  }

  // ── D2: Año faltante → 400 ───────────────────────────────────────────────
  console.log("\nD2 — Sin parámetro anio → 400");
  {
    const { status } = await get(`/api/historial/anio`, adminCookie);
    assert(status === 400, `HTTP 400 — recibido ${status}`);
  }

  // ── E1: GET /api/historial/empleado/:userId ───────────────────────────────
  console.log("\nE1 — GET /api/historial/empleado/:userId (ADMIN)");
  {
    const { status, body } = await get(
      `/api/historial/empleado/${ADMIN_ID}`,
      adminCookie
    );
    assert(status === 200, `HTTP 200 — recibido ${status}`);
    const data = (body as Record<string, unknown>)?.data as Record<string, unknown>;
    assert(!!data?.usuario, "usuario presente");
    assert(typeof data?.semanas !== "undefined", "semanas presente");
  }

  // ── E2: Filtrar por año ───────────────────────────────────────────────────
  console.log(`\nE2 — Empleado con filtro anio=${anio}`);
  {
    const { status, body } = await get(
      `/api/historial/empleado/${ADMIN_ID}?anio=${anio}`,
      adminCookie
    );
    assert(status === 200, `HTTP 200 — recibido ${status}`);
    const semanas = ((body as Record<string, unknown>)?.data as Record<string, unknown>)?.semanas as unknown[];
    assert(Array.isArray(semanas), "semanas es array");
  }

  // ── E3: Usuario inexistente → 404 ────────────────────────────────────────
  console.log("\nE3 — Usuario inexistente → 404");
  {
    const { status } = await get(
      `/api/historial/empleado/usuario-inexistente-xyz`,
      adminCookie
    );
    assert(status === 404, `HTTP 404 — recibido ${status}`);
  }

  // ── E4: Fecha 'desde' posterior a 'hasta' → 400 ──────────────────────────
  console.log("\nE4 — desde > hasta → 400");
  {
    const { status } = await get(
      `/api/historial/empleado/${ADMIN_ID}?desde=2027-12-01&hasta=2027-01-01`,
      adminCookie
    );
    assert(status === 400, `HTTP 400 — recibido ${status}`);
  }

  // ── E5: Formato desde inválido → 400 ─────────────────────────────────────
  console.log("\nE5 — Formato 'desde' inválido → 400");
  {
    const { status } = await get(
      `/api/historial/empleado/${ADMIN_ID}?desde=2027/08/01`,
      adminCookie
    );
    assert(status === 400, `HTTP 400 — recibido ${status}`);
  }

  // ── F1: EMPLEADO → 403 ───────────────────────────────────────────────────
  console.log("\nF1 — EMPLEADO no puede acceder → 403");
  {
    // Buscar un empleado real en BD
    const emp = await db.user.findFirst({ where: { role: "EMPLEADO", isActive: true } });
    if (emp) {
      const empCookie = makeSessionCookie(emp.id, "EMPLEADO");
      const r1 = await get(`/api/historial/semana/${periodoId}`, empCookie);
      const r2 = await get(`/api/historial/mes?anio=${anio}&mes=${mes}`, empCookie);
      const r3 = await get(`/api/historial/anio?anio=${anio}`, empCookie);
      const r4 = await get(`/api/historial/empleado/${ADMIN_ID}`, empCookie);
      assert(r1.status === 403, `semana → 403 (recibido ${r1.status})`);
      assert(r2.status === 403, `mes → 403 (recibido ${r2.status})`);
      assert(r3.status === 403, `anio → 403 (recibido ${r3.status})`);
      assert(r4.status === 403, `empleado → 403 (recibido ${r4.status})`);
    } else {
      console.log("  ⚠️  No hay EMPLEADOS activos en BD para probar restricción de rol");
    }
  }

  // ── Resumen ───────────────────────────────────────────────────────────────
  await db.$disconnect();
  console.log("\n" + "=".repeat(60));
  console.log(`Resultado: ${passed} pasaron / ${failed} fallaron`);
  console.log("=".repeat(60));
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  db.$disconnect();
  process.exit(1);
});
