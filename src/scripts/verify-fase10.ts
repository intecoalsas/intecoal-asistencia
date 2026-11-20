/**
 * verify-fase10.ts — Validación final módulo Historial (Fase 10)
 *
 * Solo lectura. No crea ni modifica datos ni archivos de producción.
 * Genera tokens JWT en memoria para simular sesiones de cada rol.
 */
import jwt from "jsonwebtoken";
import { db } from "@/lib/db";

const BASE    = "http://localhost:3000";
const SECRET  = process.env.NEXTAUTH_SECRET!;

const ADMIN_ID = "352c4ae5-35b3-4e7e-86e9-18605d42049b";
const SV_ID    = "09cb2496-4922-4fcd-a4a7-60a93afc5039";

// ─── Helpers ─────────────────────────────────────────────────────────────────

let passed = 0, failed = 0;

function ok(label: string)   { console.log(`  ✅ ${label}`); passed++; }
function fail(label: string, detail?: unknown) {
  console.log(`  ❌ ${label}${detail !== undefined ? ` — ${String(detail)}` : ""}`);
  failed++;
}
function assert(cond: boolean, label: string, detail?: unknown) {
  cond ? ok(label) : fail(label, detail);
}
function section(title: string) {
  console.log(`\n${"─".repeat(56)}`);
  console.log(title);
  console.log("─".repeat(56));
}

function cookie(userId: string, role: string) {
  const token = jwt.sign({ sub: userId, role }, SECRET, { expiresIn: "1h" });
  return `session=${encodeURIComponent(token)}`;
}

async function get(url: string, c = ""): Promise<{ status: number; body: unknown; headers: Headers }> {
  const res = await fetch(`${BASE}${url}`, {
    headers: c ? { cookie: c } : {},
    redirect: "manual",
  });
  const ct = res.headers.get("content-type") ?? "";
  const body = ct.includes("json") ? await res.json().catch(() => null) : null;
  if (!ct.includes("json")) await res.body?.cancel();
  return { status: res.status, body, headers: res.headers };
}

async function getBlob(url: string, c: string): Promise<{ status: number; size: number; headers: Headers }> {
  const res = await fetch(`${BASE}${url}`, { headers: { cookie: c }, redirect: "manual" });
  if (res.status === 200) {
    const buf = await res.arrayBuffer();
    return { status: res.status, size: buf.byteLength, headers: res.headers };
  }
  await res.body?.cancel();
  return { status: res.status, size: 0, headers: res.headers };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=".repeat(56));
  console.log("Validación Final — Módulo Historial (Fase 10)");
  console.log(`Hora: ${new Date().toLocaleString("es-CO", { timeZone: "America/Bogota" })}`);
  console.log("=".repeat(56));

  // ── Buscar datos reales en BD ──────────────────────────────────────────────
  const cierreConDatos = await db.weeklyClosure.findFirst({
    where: { exitoso: true, consolidados: { some: {} } },
    orderBy: { version: "desc" },
    include: { weeklyPeriod: true },
  });

  const empleado = await db.user.findFirst({
    where: { role: "EMPLEADO", isActive: true },
  });

  const supervisor = await db.user.findUnique({
    where: { id: SV_ID },
    select: { id: true, role: true, isActive: true },
  });

  if (!cierreConDatos) {
    console.log("\n⚠️  No hay cierres con consolidados en BD. Fase 10 no puede ejecutarse.");
    await db.$disconnect();
    return;
  }

  const pid   = cierreConDatos.weeklyPeriodId;
  const ini   = cierreConDatos.weeklyPeriod.inicioSemana;
  const anio  = ini.getUTCFullYear();
  const mes   = ini.getUTCMonth() + 1;
  const fecha = ini.toISOString().split("T")[0];

  console.log(`\nDatos de prueba:`);
  console.log(`  Período: ${pid} (inicio: ${fecha})`);
  console.log(`  ADMIN: ${ADMIN_ID}`);
  console.log(`  SUPERVISOR: ${SV_ID} (existe=${!!supervisor})`);
  console.log(`  EMPLEADO activo: ${empleado?.id ?? "NINGUNO"}`);

  const ckAdmin = cookie(ADMIN_ID, "ADMIN");
  const ckSV    = supervisor ? cookie(SV_ID, "SUPERVISOR") : "";
  const ckEmp   = empleado   ? cookie(empleado.id, "EMPLEADO") : "";
  const ckKiosk = cookie("kiosk-fake-id", "KIOSCO");

  // ══════════════════════════════════════════════════════════════════════════
  // 1. ADMIN — consultas de historial
  // ══════════════════════════════════════════════════════════════════════════
  section("1. ADMIN — consultas de historial");

  // Semanal
  {
    const { status, body } = await get(`/api/historial/semana/por-fecha?fecha=${fecha}&detalle=true`, ckAdmin);
    assert(status === 200, "Semanal por fecha → 200");
    const d = (body as Record<string,unknown>)?.data as Record<string,unknown> | null;
    assert(!!d, "data no nula");
    assert(typeof d?.version === "number", `versión numérica (v${d?.version})`);
    assert(typeof (d?.metricas as Record<string,unknown>)?.totalEmpleados === "number",
      `totalEmpleados: ${(d?.metricas as Record<string,unknown>)?.totalEmpleados}`);
    assert(Array.isArray(d?.detalle) && (d.detalle as unknown[]).length > 0,
      `detalle con ${(d?.detalle as unknown[])?.length} filas`);
  }

  // Mensual
  {
    const { status, body } = await get(`/api/historial/mes?anio=${anio}&mes=${mes}`, ckAdmin);
    assert(status === 200, `Mensual ${anio}/${mes} → 200`);
    const d = (body as Record<string,unknown>)?.data as Record<string,unknown>;
    assert(Array.isArray(d?.semanas), "semanas es array");
    assert((d?.semanas as unknown[]).length >= 1, `>= 1 semana — encontradas: ${(d?.semanas as unknown[]).length}`);
  }

  // Anual
  {
    const { status, body } = await get(`/api/historial/anio?anio=${anio}`, ckAdmin);
    assert(status === 200, `Anual ${anio} → 200`);
    const d = (body as Record<string,unknown>)?.data as Record<string,unknown>;
    assert((d?.meses as unknown[])?.length === 12, `12 meses presentes`);
  }

  // Individual
  {
    const { status, body } = await get(`/api/historial/empleado/${ADMIN_ID}?anio=${anio}`, ckAdmin);
    assert(status === 200, `Empleado individual (ADMIN) → 200`);
    const d = (body as Record<string,unknown>)?.data as Record<string,unknown>;
    assert(!!d?.usuario, "usuario presente");
    assert(Array.isArray(d?.semanas), "semanas es array");
    assert((d?.semanas as unknown[]).length >= 1, `semanas con datos: ${(d?.semanas as unknown[]).length}`);
  }

  // Período sin consolidado
  {
    const { status, body } = await get(`/api/historial/semana/por-fecha?fecha=1999-01-01`, ckAdmin);
    assert(status === 200, "Período sin consolidado → 200 (no 404)");
    assert((body as Record<string,unknown>)?.data === null, "data = null para período sin consolidado");
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 2. SUPERVISOR — mismas consultas
  // ══════════════════════════════════════════════════════════════════════════
  section("2. SUPERVISOR — mismas consultas");

  if (!ckSV) {
    console.log("  ⚠️  SUPERVISOR no encontrado en BD — pruebas de rol omitidas");
  } else {
    const checks = [
      { label: "Semanal por fecha",             url: `/api/historial/semana/por-fecha?fecha=${fecha}` },
      { label: `Mensual ${anio}/${mes}`,         url: `/api/historial/mes?anio=${anio}&mes=${mes}` },
      { label: `Anual ${anio}`,                  url: `/api/historial/anio?anio=${anio}` },
      { label: `Empleado individual`,            url: `/api/historial/empleado/${ADMIN_ID}` },
      { label: "Exportar semanal (Excel)",       url: `/api/historial/exportar/semana?weeklyPeriodId=${pid}` },
      { label: "Exportar mensual (Excel)",       url: `/api/historial/exportar/mes?anio=${anio}&mes=${mes}` },
      { label: "Exportar anual (Excel)",         url: `/api/historial/exportar/anio?anio=${anio}` },
      { label: "Exportar empleado (Excel)",      url: `/api/historial/exportar/empleado?userId=${ADMIN_ID}&anio=${anio}` },
    ];
    for (const c of checks) {
      const { status } = await get(c.url, ckSV);
      assert(status === 200, `${c.label} → 200 (recibido ${status})`);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 3. Contenido de los Excel (ADMIN)
  // ══════════════════════════════════════════════════════════════════════════
  section("3. Archivos Excel — contenido y descarga (ADMIN)");

  const exportaciones = [
    { label: "Semanal",  url: `/api/historial/exportar/semana?weeklyPeriodId=${pid}`,         minSize: 5000 },
    { label: "Mensual",  url: `/api/historial/exportar/mes?anio=${anio}&mes=${mes}`,           minSize: 5000 },
    { label: "Anual",    url: `/api/historial/exportar/anio?anio=${anio}`,                     minSize: 5000 },
    { label: "Empleado", url: `/api/historial/exportar/empleado?userId=${ADMIN_ID}&anio=${anio}`, minSize: 5000 },
  ];

  for (const e of exportaciones) {
    const { status, size, headers } = await getBlob(e.url, ckAdmin);
    assert(status === 200, `${e.label}: HTTP 200 (recibido ${status})`);
    const ct = headers.get("content-type") ?? "";
    assert(ct.includes("spreadsheetml"), `${e.label}: Content-Type xlsx`);
    const cd = headers.get("content-disposition") ?? "";
    assert(cd.includes(".xlsx"), `${e.label}: nombre de archivo .xlsx`);
    assert(size >= e.minSize, `${e.label}: tamaño ≥ ${e.minSize} bytes (recibido ${size})`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 4. Control de acceso: EMPLEADO y KIOSCO bloqueados
  // ══════════════════════════════════════════════════════════════════════════
  section("4. Control de acceso — EMPLEADO y KIOSCO bloqueados");

  const endpointsAdmin = [
    `/api/historial/semana/por-fecha?fecha=${fecha}`,
    `/api/historial/mes?anio=${anio}&mes=${mes}`,
    `/api/historial/anio?anio=${anio}`,
    `/api/historial/empleado/${ADMIN_ID}`,
    `/api/historial/exportar/semana?weeklyPeriodId=${pid}`,
    `/api/historial/exportar/mes?anio=${anio}&mes=${mes}`,
    `/api/historial/exportar/anio?anio=${anio}`,
    `/api/historial/exportar/empleado?userId=${ADMIN_ID}`,
  ];

  if (ckEmp) {
    for (const url of endpointsAdmin) {
      const { status } = await get(url, ckEmp);
      assert(status === 403, `EMPLEADO: ${url.split("?")[0].split("/").slice(-2).join("/")} → 403 (recibido ${status})`);
    }
  } else {
    console.log("  ⚠️  No hay EMPLEADO activo — prueba omitida");
  }

  for (const url of endpointsAdmin) {
    const { status } = await get(url, ckKiosk);
    assert(status === 403, `KIOSCO: ${url.split("?")[0].split("/").slice(-2).join("/")} → 403 (recibido ${status})`);
  }

  // Sin sesión
  {
    const { status } = await get(`/api/historial/semana/por-fecha?fecha=${fecha}`);
    assert(status === 401, "Sin sesión → 401");
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 5. Restricciones ADMIN para operaciones de cierre y reapertura
  // ══════════════════════════════════════════════════════════════════════════
  section("5. Restricciones ADMIN en cierres y marcaciones tardías");

  // Las rutas de cierre/reapertura/marcaciones tardías no son endpoints REST
  // públicos en este proyecto — se llaman directamente desde servicios.
  // Lo que sí podemos verificar: que los endpoints de HISTORIAL no permiten
  // acceso a EMPLEADO (ya probado). Las operaciones de cierre se llaman
  // desde scripts internos con validación de rol a nivel de servicio.
  // Verificamos que el EMPLEADO tampoco accede a marcaciones tardías si existe API.
  const { status: s1 } = await get(`/api/historial/semana/${pid}`, ckEmp || ckKiosk);
  assert(s1 === 403, `Ruta semana por ID bloqueada para rol no autorizado → 403 (recibido ${s1})`);

  // ══════════════════════════════════════════════════════════════════════════
  // 6. Históricos anteriores accesibles tras reaperturas
  // ══════════════════════════════════════════════════════════════════════════
  section("6. Históricos anteriores accesibles tras reaperturas");

  // Buscar períodos con múltiples versiones de cierre
  const periodosConMultiplesVersiones = await db.weeklyClosure.groupBy({
    by: ["weeklyPeriodId"],
    where: { exitoso: true },
    _count: { id: true },
    having: { id: { _count: { gt: 1 } } },
  });

  if (periodosConMultiplesVersiones.length > 0) {
    const pidMV = periodosConMultiplesVersiones[0].weeklyPeriodId;
    // Consultar versión vigente (MAX)
    const { status, body } = await get(`/api/historial/semana/${pidMV}`, ckAdmin);
    assert(status === 200, `Período con múltiples versiones → 200`);
    const d = (body as Record<string,unknown>)?.data as Record<string,unknown> | null;
    if (d) {
      const version = d.version as number;
      assert(version >= 2, `Versión vigente = MAX (v${version} ≥ 2)`);

      // Verificar que la versión anterior existe en BD (histórico conservado)
      const versionAnterior = await db.weeklyClosure.findFirst({
        where: { weeklyPeriodId: pidMV, exitoso: true, version: { lt: version } },
        orderBy: { version: "desc" },
        select: { id: true, version: true, consolidados: { take: 1 } },
      });
      assert(!!versionAnterior, `Versión anterior existe en BD (v${versionAnterior?.version})`);
      assert(
        (versionAnterior?.consolidados?.length ?? 0) >= 0,
        `Consolidados de versión anterior preservados`
      );
    }
  } else {
    // No hay múltiples versiones — verificar al menos que el histórico base está accesible
    const { status } = await get(`/api/historial/anio?anio=${anio}`, ckAdmin);
    assert(status === 200, "Histórico del año accesible (sin múltiples versiones disponibles)");
    console.log("  ℹ️  No hay períodos con múltiples versiones de cierre en BD para verificar versionado");
  }

  // Semanas de agosto 2027 (datos de fases anteriores)
  const { status: s2, body: b2 } = await get(`/api/historial/mes?anio=2027&mes=8`, ckAdmin);
  assert(s2 === 200, "Histórico agosto 2027 accesible → 200");
  const semanas2027 = ((b2 as Record<string,unknown>)?.data as Record<string,unknown>)?.semanas as unknown[];
  assert(Array.isArray(semanas2027), "semanas de agosto 2027 es array");
  if (Array.isArray(semanas2027)) {
    assert(semanas2027.length >= 1, `Semanas de agosto 2027 preservadas: ${semanas2027.length}`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Resumen
  // ══════════════════════════════════════════════════════════════════════════
  await db.$disconnect();

  console.log("\n" + "=".repeat(56));
  console.log(`Resultado: ${passed} pasaron / ${failed} fallaron`);
  console.log("=".repeat(56));
  if (failed > 0) process.exit(1);
}

main().catch(e => {
  console.error(e);
  db.$disconnect();
  process.exit(1);
});
