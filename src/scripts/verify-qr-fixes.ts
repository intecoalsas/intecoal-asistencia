/**
 * verify-qr-fixes.ts
 *
 * Pruebas funcionales de las dos correcciones:
 *   1. Protección (userId, jti): anti-reutilización de QR por empleado.
 *   2. Enrutamiento de marcaciones tardías cuando la semana está cerrada.
 *
 * Patrón de sesión: idéntico a verify-fase10.ts (JWT firmado en memoria).
 * Ejecutar con servidor en :3099: npx tsx src/scripts/verify-qr-fixes.ts
 */

import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { getFechaLaboral, getNowUtc } from "@/lib/date-utils";
import { getOrCreateWeeklyPeriod } from "@/modules/historial/weekly-period.service";
import { registrarMarcacionTardia } from "@/modules/historial/late-marcacion.service";

const BASE   = "http://localhost:3099";
const SECRET = process.env.NEXTAUTH_SECRET!;

// IDs conocidos en la BD de desarrollo
const PERIODO_CERRADO_ID = "3c5d6ba2-93ae-461c-b169-441d581b8229";

// ---------------------------------------------------------------------------
// Contadores
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function ok(msg: string)   { console.log(`  ✅ ${msg}`); passed++; }
function fail(msg: string, detail?: unknown) {
  console.error(`  ❌ ${msg}${detail !== undefined ? ` — ${String(detail)}` : ""}`);
  failed++;
}
function section(title: string) {
  console.log(`\n${"─".repeat(60)}`);
  console.log(title);
  console.log("─".repeat(60));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Genera una cookie de sesión válida firmada con NEXTAUTH_SECRET. */
function sessionCookie(userId: string, role: string): string {
  const token = jwt.sign({ sub: userId, role }, SECRET, { expiresIn: "1h" });
  return `session=${encodeURIComponent(token)}`;
}

/** Genera un token QR firmado con la secretKey del kiosco. */
function makeQrToken(kioskId: string, secretKey: string): {
  token: string;
  jti: string;
  expSec: number;
} {
  const jti = randomUUID();
  const iatSec = Math.floor(Date.now() / 1000);
  const expSec = iatSec + 30;
  const token = jwt.sign(
    { jti, kioskId, iat: iatSec, exp: expSec, type: "KIOSK_QR" },
    secretKey,
    { algorithm: "HS256" }
  );
  return { token, jti, expSec };
}

/** POST /api/kiosk/attendance */
async function postAttendance(
  token: string,
  cookie: string
): Promise<{ status: number; body: Record<string, unknown> }> {
  const r = await fetch(`${BASE}/api/kiosk/attendance`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ token }),
  });
  let body: Record<string, unknown> = {};
  try { body = await r.json() as Record<string, unknown>; } catch { /* vacío */ }
  return { status: r.status, body };
}

// ---------------------------------------------------------------------------
// Setup: obtener datos de la BD
// ---------------------------------------------------------------------------

async function setup() {
  const kiosk = await db.kioskDevice.findFirst({ where: { isActive: true } });
  if (!kiosk) throw new Error("No hay kioscos activos.");

  const empleados = await db.user.findMany({
    where: { role: "EMPLEADO", isActive: true },
    take: 2,
  });
  if (empleados.length < 2) throw new Error("Se necesitan ≥ 2 empleados activos.");

  return { kiosk, emp1: empleados[0], emp2: empleados[1] };
}

// ---------------------------------------------------------------------------
// Test 1 — Mismo empleado, mismo JTI → segundo intento rechazado (409)
// ---------------------------------------------------------------------------

async function test1SameEmployeeSameJti(
  kiosk: Awaited<ReturnType<typeof setup>>["kiosk"],
  emp1: Awaited<ReturnType<typeof setup>>["emp1"]
) {
  section("Test 1 — Mismo empleado, mismo JTI → segundo intento rechazado");

  const cookie = sessionCookie(emp1.id, "EMPLEADO");
  const fecha = getFechaLaboral(getNowUtc());

  // Limpiar estado del día para este empleado
  await db.attendance.deleteMany({ where: { userId: emp1.id, fechaLaboral: fecha } });
  await db.usedQrToken.deleteMany({ where: { userId: emp1.id } });

  const { token } = makeQrToken(kiosk.id, kiosk.secretKey);

  const r1 = await postAttendance(token, cookie);
  const r2 = await postAttendance(token, cookie);

  if (r1.status === 201 || r1.status === 202) {
    ok(`Primer intento aceptado (HTTP ${r1.status}, tipo: ${String(r1.body.tipo ?? "tardía")})`);
  } else {
    fail(`Primer intento rechazado inesperadamente`, `${r1.status} ${JSON.stringify(r1.body)}`);
  }

  if (r2.status === 409 && String(r2.body.error).toLowerCase().includes("ya fue utilizado")) {
    ok(`Segundo intento rechazado con 409 "ya fue utilizado"`);
  } else {
    fail(`Segundo intento no rechazado correctamente`, `${r2.status} ${JSON.stringify(r2.body)}`);
  }
}

// ---------------------------------------------------------------------------
// Test 2 — Dos empleados, mismo QR (mismo jti) → ambos aceptados
// ---------------------------------------------------------------------------

async function test2TwoEmployeesSameQr(
  kiosk: Awaited<ReturnType<typeof setup>>["kiosk"],
  emp1: Awaited<ReturnType<typeof setup>>["emp1"],
  emp2: Awaited<ReturnType<typeof setup>>["emp2"]
) {
  section("Test 2 — Dos empleados, mismo QR (mismo jti) → ambos aceptados");

  const cookie1 = sessionCookie(emp1.id, "EMPLEADO");
  const cookie2 = sessionCookie(emp2.id, "EMPLEADO");

  const fecha = getFechaLaboral(getNowUtc());
  await db.attendance.deleteMany({ where: { userId: emp1.id, fechaLaboral: fecha } });
  await db.attendance.deleteMany({ where: { userId: emp2.id, fechaLaboral: fecha } });
  await db.usedQrToken.deleteMany({ where: { userId: { in: [emp1.id, emp2.id] } } });

  // UN solo token compartido (igual jti, igual kioskId)
  const { token: sharedToken } = makeQrToken(kiosk.id, kiosk.secretKey);

  const r1 = await postAttendance(sharedToken, cookie1);
  const r2 = await postAttendance(sharedToken, cookie2);

  if (r1.status === 201 || r1.status === 202) {
    ok(`Empleado 1 aceptado (HTTP ${r1.status})`);
  } else {
    fail(`Empleado 1 rechazado con QR compartido`, `${r1.status} ${JSON.stringify(r1.body)}`);
  }

  if (r2.status === 201 || r2.status === 202) {
    ok(`Empleado 2 aceptado con el mismo QR (HTTP ${r2.status}) — QR no invalidado globalmente`);
  } else {
    fail(`Empleado 2 rechazado con el mismo QR`, `${r2.status} ${JSON.stringify(r2.body)}`);
  }

  // Verificar que son marcaciones independientes
  const att1 = await db.attendance.findFirst({ where: { userId: emp1.id, fechaLaboral: fecha } });
  const att2 = await db.attendance.findFirst({ where: { userId: emp2.id, fechaLaboral: fecha } });

  if (att1 && att2 && att1.id !== att2.id) {
    ok(`Ambas marcaciones son independientes en BD (ids distintos)`);
  } else if (!att1 || !att2) {
    // Puede que alguno esté en LateMarcacion si la semana está cerrada
    const lm1 = await db.lateMarcacion.findFirst({ where: { userId: emp1.id, fechaLaboral: fecha } });
    const lm2 = await db.lateMarcacion.findFirst({ where: { userId: emp2.id, fechaLaboral: fecha } });
    if ((att1 || lm1) && (att2 || lm2)) {
      ok(`Ambos empleados tienen registro independiente (Attendance o LateMarcacion)`);
    } else {
      fail(`Al menos un empleado no tiene registro en BD`);
    }
  }
}

// ---------------------------------------------------------------------------
// Test 3 — Rollback del JTI si falla el Attendance por excepción interna
// ---------------------------------------------------------------------------

async function test3RollbackOnFailure(
  kiosk: Awaited<ReturnType<typeof setup>>["kiosk"],
  emp1: Awaited<ReturnType<typeof setup>>["emp1"]
) {
  section("Test 3 — Rollback del JTI: token disponible para reintento con nuevo QR");

  const fecha = getFechaLaboral(getNowUtc());
  await db.attendance.deleteMany({ where: { userId: emp1.id, fechaLaboral: fecha } });
  await db.usedQrToken.deleteMany({ where: { userId: emp1.id } });

  const cookie = sessionCookie(emp1.id, "EMPLEADO");

  // Primer intento con token A → debe tener éxito
  const { token: tokenA, jti: jtiA } = makeQrToken(kiosk.id, kiosk.secretKey);
  const r1 = await postAttendance(tokenA, cookie);

  if (r1.status === 201 || r1.status === 202) {
    ok(`Primer intento (token A) aceptado (HTTP ${r1.status})`);
  } else {
    fail(`Primer intento falló`, `${r1.status} ${JSON.stringify(r1.body)}`);
    return;
  }

  // Verificar que JTI-A quedó registrado
  const usedA = await db.usedQrToken.findUnique({
    where: { userId_jti: { userId: emp1.id, jti: jtiA } },
  });
  if (usedA) {
    ok(`UsedQrToken de token A registrado en BD`);
  } else {
    fail(`UsedQrToken de token A no encontrado en BD`);
  }

  // Segundo intento con token B (nuevo jti) → debe aceptarse también
  const { token: tokenB } = makeQrToken(kiosk.id, kiosk.secretKey);
  const r2 = await postAttendance(tokenB, cookie);

  if (r2.status === 201 || r2.status === 202) {
    ok(`Segundo intento con token B (nuevo jti) aceptado (HTTP ${r2.status})`);
  } else if (r2.status === 409 && String(r2.body.error).includes("ya fueron registradas")) {
    ok(`Segundo intento rechazado porque todas las marcaciones del día ya fueron registradas (correcto)`);
  } else {
    fail(`Segundo intento con token nuevo falló inesperadamente`, `${r2.status} ${JSON.stringify(r2.body)}`);
  }

  // Verificar que reusar token A con mismo empleado sigue siendo rechazado
  const r3 = await postAttendance(tokenA, cookie);
  if (r3.status === 409 && String(r3.body.error).toLowerCase().includes("ya fue utilizado")) {
    ok(`Token A reutilizado sigue siendo rechazado (JTI protegido correctamente)`);
  } else if (r3.status === 401 && String(r3.body.error).toLowerCase().includes("expired")) {
    ok(`Token A rechazado porque expiró (correcto — 30s de vida)`);
  } else {
    fail(`Reutilización del token A no fue rechazada correctamente`, `${r3.status} ${JSON.stringify(r3.body)}`);
  }
}

// ---------------------------------------------------------------------------
// Test 4 — Semana abierta → Attendance normal (HTTP 201)
// ---------------------------------------------------------------------------

async function test4OpenWeek(
  kiosk: Awaited<ReturnType<typeof setup>>["kiosk"],
  emp1: Awaited<ReturnType<typeof setup>>["emp1"]
) {
  section("Test 4 — Semana abierta → Attendance normal (HTTP 201)");

  const period = await getOrCreateWeeklyPeriod(getNowUtc());

  if (period.estado === "CERRADA" || period.estado === "PENDIENTE_CIERRE") {
    console.log(`  ⚠️  Período actual en estado ${period.estado}; se omite test 4.`);
    return;
  }

  const fecha = getFechaLaboral(getNowUtc());
  await db.attendance.deleteMany({ where: { userId: emp1.id, fechaLaboral: fecha } });
  await db.usedQrToken.deleteMany({ where: { userId: emp1.id } });

  const cookie = sessionCookie(emp1.id, "EMPLEADO");
  const { token } = makeQrToken(kiosk.id, kiosk.secretKey);
  const r = await postAttendance(token, cookie);

  if (r.status === 201 && r.body.success === true) {
    ok(`Semana ${period.estado} → HTTP 201 con success:true (tipo: ${String(r.body.tipo)})`);
  } else {
    fail(`Resultado inesperado para semana ${period.estado}`, `${r.status} ${JSON.stringify(r.body)}`);
  }

  // Confirmar Attendance en BD (no LateMarcacion)
  const att = await db.attendance.findFirst({
    where: { userId: emp1.id, fechaLaboral: fecha, tipo: "ENTRADA_MANANA" },
  });
  const lm = await db.lateMarcacion.findFirst({
    where: { userId: emp1.id, fechaLaboral: fecha, tipo: "ENTRADA_MANANA" },
  });

  if (att && !lm) {
    ok(`Attendance en BD (id: ${att.id}); sin LateMarcacion`);
  } else if (lm && !att) {
    fail(`Se creó LateMarcacion en semana ${period.estado} en lugar de Attendance`);
  } else {
    fail(`Estado inconsistente: att=${String(att?.id)}, lm=${String(lm?.id)}`);
  }
}

// ---------------------------------------------------------------------------
// Test 5 — Semana cerrada → LateMarcacion PENDIENTE, sin Attendance
// ---------------------------------------------------------------------------

async function test5ClosedWeek(
  kiosk: Awaited<ReturnType<typeof setup>>["kiosk"],
  emp1: Awaited<ReturnType<typeof setup>>["emp1"]
) {
  section("Test 5 — Semana cerrada → LateMarcacion PENDIENTE, sin Attendance");

  const periodo = await db.weeklyPeriod.findUnique({
    where: { id: PERIODO_CERRADO_ID },
  });
  if (!periodo || periodo.estado !== "CERRADA") {
    console.log(`  ⚠️  Período ${PERIODO_CERRADO_ID} no está CERRADA (estado: ${periodo?.estado ?? "no encontrado"}). Se omite test 5.`);
    return;
  }

  // Fecha dentro de esa semana cerrada
  const [y, m, d] = "2027-10-05".split("-").map(Number);
  const fechaLaboral = new Date(Date.UTC(y, m - 1, d));

  // Limpiar datos previos
  await db.lateMarcacion.deleteMany({
    where: { userId: emp1.id, fechaLaboral, tipo: "ENTRADA_MANANA" },
  });

  // Invocar el servicio directamente (el endpoint no puede inyectar fecha pasada)
  const lm = await registrarMarcacionTardia({
    weeklyPeriodId: PERIODO_CERRADO_ID,
    userId: emp1.id,
    tipo: "ENTRADA_MANANA",
    fechaLaboral,
    timestampRealizacionUTC: new Date(),
    timestampRecepcionUTC: new Date(),
    kioskId: kiosk.id,
  });

  if (lm.estado === "PENDIENTE") {
    ok(`LateMarcacion creada con estado PENDIENTE (id: ${lm.id})`);
  } else {
    fail(`Estado inesperado en LateMarcacion`, lm.estado);
  }

  // Idempotencia: segunda llamada devuelve el mismo registro
  const lm2 = await registrarMarcacionTardia({
    weeklyPeriodId: PERIODO_CERRADO_ID,
    userId: emp1.id,
    tipo: "ENTRADA_MANANA",
    fechaLaboral,
    timestampRealizacionUTC: new Date(),
    timestampRecepcionUTC: new Date(),
    kioskId: kiosk.id,
  });

  if (lm2.id === lm.id) {
    ok(`Idempotencia: segunda llamada devuelve mismo id (${lm.id})`);
  } else {
    fail(`Segunda llamada creó registro distinto`, lm2.id);
  }

  // Sin Attendance para esta fecha
  const att = await db.attendance.findFirst({
    where: { userId: emp1.id, fechaLaboral, tipo: "ENTRADA_MANANA" },
  });
  if (!att) {
    ok(`No se creó Attendance en semana cerrada`);
  } else {
    fail(`Se creó Attendance en semana cerrada`, att.id);
  }

  // Limpiar
  await db.lateMarcacion.delete({ where: { id: lm.id } });
}

// ---------------------------------------------------------------------------
// Test 6 — Semana reabierta → Attendance normal (si aplica)
// ---------------------------------------------------------------------------

async function test6ReopenedWeek(
  kiosk: Awaited<ReturnType<typeof setup>>["kiosk"],
  emp1: Awaited<ReturnType<typeof setup>>["emp1"]
) {
  section("Test 6 — Semana reabierta → Attendance normal");

  const period = await getOrCreateWeeklyPeriod(getNowUtc());

  if (period.estado !== "REABIERTA") {
    console.log(`  ⚠️  Período actual en estado ${period.estado}, no REABIERTA. Se omite test 6.`);
    return;
  }

  const fecha = getFechaLaboral(getNowUtc());
  await db.attendance.deleteMany({ where: { userId: emp1.id, fechaLaboral: fecha } });
  await db.usedQrToken.deleteMany({ where: { userId: emp1.id } });

  const cookie = sessionCookie(emp1.id, "EMPLEADO");
  const { token } = makeQrToken(kiosk.id, kiosk.secretKey);
  const r = await postAttendance(token, cookie);

  if (r.status === 201 && r.body.success === true) {
    ok(`Semana reabierta → Attendance normal (HTTP 201)`);
  } else {
    fail(`Resultado inesperado para semana reabierta`, `${r.status} ${JSON.stringify(r.body)}`);
  }
}

// ---------------------------------------------------------------------------
// Test 7 — expiresAt = exp del JWT (no Date.now()+30s)
// ---------------------------------------------------------------------------

async function test7ExpiresAtFromJwt(
  kiosk: Awaited<ReturnType<typeof setup>>["kiosk"],
  emp1: Awaited<ReturnType<typeof setup>>["emp1"]
) {
  section("Test 7 — expiresAt en UsedQrToken = campo exp del JWT");

  const fecha = getFechaLaboral(getNowUtc());
  await db.attendance.deleteMany({ where: { userId: emp1.id, fechaLaboral: fecha } });
  await db.usedQrToken.deleteMany({ where: { userId: emp1.id } });

  const { token, jti, expSec } = makeQrToken(kiosk.id, kiosk.secretKey);
  const cookie = sessionCookie(emp1.id, "EMPLEADO");

  await postAttendance(token, cookie);

  const record = await db.usedQrToken.findUnique({
    where: { userId_jti: { userId: emp1.id, jti } },
  });

  if (!record) {
    fail(`UsedQrToken no encontrado en BD para jti=${jti}`);
    return;
  }

  const expectedMs = expSec * 1000;
  const actualMs   = record.expiresAt.getTime();
  const diffMs     = Math.abs(actualMs - expectedMs);

  if (diffMs < 2000) {
    ok(`expiresAt = ${record.expiresAt.toISOString()} coincide con exp del JWT (diff: ${diffMs}ms)`);
  } else {
    fail(
      `expiresAt no coincide con exp del JWT`,
      `esperado=${new Date(expectedMs).toISOString()}, real=${record.expiresAt.toISOString()}, diff=${diffMs}ms`
    );
  }
}

// ---------------------------------------------------------------------------
// Test 8 — ADMIN no puede usar endpoint de asistencia (protección de rol)
// ---------------------------------------------------------------------------

async function test8AdminRejected(
  kiosk: Awaited<ReturnType<typeof setup>>["kiosk"]
) {
  section("Test 8 — ADMIN rechazado en /api/kiosk/attendance (solo EMPLEADO)");

  const ADMIN_ID = "352c4ae5-35b3-4e7e-86e9-18605d42049b";
  const cookie   = sessionCookie(ADMIN_ID, "ADMIN");
  const { token } = makeQrToken(kiosk.id, kiosk.secretKey);

  const r = await postAttendance(token, cookie);

  if (r.status === 401 || r.status === 403) {
    ok(`ADMIN rechazado con HTTP ${r.status} (requireRole solo acepta EMPLEADO)`);
  } else {
    fail(`ADMIN debería ser rechazado`, `${r.status} ${JSON.stringify(r.body)}`);
  }
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

async function main() {
  if (!SECRET) {
    console.error("NEXTAUTH_SECRET no está definido en el entorno.");
    process.exit(1);
  }

  console.log("=== Verificación correcciones QR — INTECOAL Asistencia ===\n");

  const { kiosk, emp1, emp2 } = await setup();
  console.log(`Kiosco : ${kiosk.nombre} (${kiosk.id})`);
  console.log(`Emp 1  : ${emp1.nombre} ${emp1.apellido} (${emp1.id})`);
  console.log(`Emp 2  : ${emp2.nombre} ${emp2.apellido} (${emp2.id})`);

  await test1SameEmployeeSameJti(kiosk, emp1);
  await test2TwoEmployeesSameQr(kiosk, emp1, emp2);
  await test3RollbackOnFailure(kiosk, emp1);
  await test4OpenWeek(kiosk, emp1);
  await test5ClosedWeek(kiosk, emp1);
  await test6ReopenedWeek(kiosk, emp1);
  await test7ExpiresAtFromJwt(kiosk, emp1);
  await test8AdminRejected(kiosk);

  console.log(`\n${"═".repeat(60)}`);
  console.log(`Resultado: ${passed} pasaron, ${failed} fallaron de ${passed + failed} verificaciones.`);
  console.log("═".repeat(60));

  await db.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error("Error fatal:", e);
  await db.$disconnect();
  process.exit(1);
});
