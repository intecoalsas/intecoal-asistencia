import jwt from "jsonwebtoken";

const ADMIN_ID = "352c4ae5-35b3-4e7e-86e9-18605d42049b";
const token = jwt.sign({ sub: ADMIN_ID, role: "ADMIN" }, process.env.NEXTAUTH_SECRET!, { expiresIn: "1h" });
const cookie = `session=${encodeURIComponent(token)}`;

async function check(label: string, url: string, useCookie = true) {
  const headers: Record<string, string> = useCookie ? { cookie } : {};
  const r = await fetch(`http://localhost:3000${url}`, { headers, redirect: "manual" });
  let summary = "";
  try {
    const body = await r.json() as Record<string, unknown>;
    if ("data" in body) {
      summary = body.data !== null ? "data=OK" : "data=null";
      if (body.mensaje) summary += ` (${body.mensaje})`;
    } else if ("error" in body) {
      summary = `error="${body.error}"`;
    } else if ("meses" in body || "semanas" in body) {
      summary = "data=OK";
    } else {
      summary = "OK";
    }
  } catch {
    summary = `HTTP ${r.status} (no JSON)`;
  }
  const icon = r.status < 400 ? "✅" : (r.status === 401 || r.status === 403 ? "🔒" : "❌");
  console.log(`${icon} [${r.status}] ${label} → ${summary}`);
}

async function main() {
  console.log("=".repeat(60));
  console.log("Validación visual Fase 8 — rutas y APIs");
  console.log("=".repeat(60));

  // Ruta de página (Next.js la sirve como HTML)
  const pageRes = await fetch("http://localhost:3000/historial", {
    headers: { cookie },
    redirect: "manual",
  });
  console.log(`\n📄 GET /historial → HTTP ${pageRes.status} (${pageRes.status === 200 ? "página servida ✅" : "error ❌"})`);

  console.log("\n── APIs de historial ──────────────────────────────────────");
  await check("Semanal: fecha con datos (2027-10-04)",      "/api/historial/semana/por-fecha?fecha=2027-10-04&detalle=true");
  await check("Semanal: fecha sin datos (1999-01-01)",      "/api/historial/semana/por-fecha?fecha=1999-01-01");
  await check("Semanal: período por ID (válido)",           "/api/historial/semana/por-fecha?fecha=2027-08-02");
  await check("Mensual: octubre 2027",                      "/api/historial/mes?anio=2027&mes=10");
  await check("Mensual: agosto 2027",                       "/api/historial/mes?anio=2027&mes=8");
  await check("Anual: 2027 (12 meses)",                     "/api/historial/anio?anio=2027");
  await check("Empleados (para selector)",                  "/api/empleados");
  await check(`Empleado individual (${ADMIN_ID.slice(0,8)}…)`, `/api/historial/empleado/${ADMIN_ID}?anio=2027`);

  console.log("\n── Validaciones de error ──────────────────────────────────");
  await check("Sin sesión → 401",                           "/api/historial/semana/por-fecha?fecha=2027-10-04", false);
  await check("Mes inválido (13) → 400",                    "/api/historial/mes?anio=2027&mes=13");
  await check("Año fuera de rango → 400",                   "/api/historial/anio?anio=1800");
  await check("Sin param fecha → 400",                      "/api/historial/semana/por-fecha");
  await check("Usuario inexistente → 404",                  "/api/historial/empleado/no-existe-xyz");

  console.log("\n" + "=".repeat(60));
}

main().catch(e => { console.error(e); process.exit(1); });
