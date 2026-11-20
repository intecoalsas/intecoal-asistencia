/**
 * Script de verificación — Fase 3.1: Cierres y reaperturas
 *
 * Ejecutar con:
 *   npx tsx --tsconfig tsconfig.scripts.json src/scripts/verify-closure.ts
 *
 * Usa una semana de prueba futura (2027-03-01 lunes) que no colisiona
 * con datos reales. Al terminar consulta si puede limpiar y lo informa.
 *
 * IMPORTANTE: este script NO elimina datos automáticamente.
 * Informa los IDs creados para que el operador autorice la limpieza.
 */

import { db } from "@/lib/db";
import {
  getOrCreateWeeklyPeriod,
  cerrarPeriodo,
  reabrirPeriodo,
  obtenerCierreVigente,
  listarCierres,
  esPeriodoCerrado,
  permiteModificaciones,
  HistorialError,
} from "@/modules/historial";
import { EstadoPeriodo, TipoCierre } from "@prisma/client";

// IDs de usuarios reales de la BD de desarrollo
const ADMIN_ID    = "352c4ae5-35b3-4e7e-86e9-18605d42049b";
const SUPER_ID    = "09cb2496-4922-4fcd-a4a7-60a93afc5039";

// Semana de prueba: lunes 2027-03-01 — fecha futura sin datos reales
const TEST_DATE   = new Date(Date.UTC(2027, 2, 3, 12, 0, 0)); // miércoles 2027-03-03 mediodía UTC

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
  let periodoId: string | undefined;

  try {
    // ── Preparación ──────────────────────────────────────────────────────
    console.log("\n── Preparación: crear período de prueba ─────────────────────");
    const periodo = await getOrCreateWeeklyPeriod(TEST_DATE);
    periodoId = periodo.id;
    console.log(`  Período creado: id=${periodo.id.slice(0,8)}… inicio=${periodo.inicioSemana.toISOString().split("T")[0]} estado=${periodo.estado}`);
    if (periodo.estado !== EstadoPeriodo.ABIERTA) {
      fail("estado inicial", `esperado ABIERTA, obtenido ${periodo.estado}`);
      return;
    }
    pass("período en estado ABIERTA listo para pruebas");

    // ── V1: Cierre de período abierto → v1 ───────────────────────────────
    console.log("\n── V1: Cierre de período abierto → v1 ──────────────────────");
    const { periodo: p1, cierre: c1 } = await cerrarPeriodo({
      weeklyPeriodId: periodo.id,
      tipo: TipoCierre.MANUAL_ADMIN,
      actorId: ADMIN_ID,
      motivo: "Cierre de prueba v1",
    });
    if (p1.estado === EstadoPeriodo.CERRADA) pass(`estado=${p1.estado}`);
    else fail("estado tras cierre v1", p1.estado);
    if (c1.version === 1) pass(`version=${c1.version}, exitoso=${c1.exitoso}`);
    else fail("versión c1", `esperado 1, obtenido ${c1.version}`);
    if (c1.exitoso) pass("exitoso=true");
    else fail("exitoso c1", "esperado true");

    // ── V2: Rechazo de segundo cierre sin reapertura ──────────────────────
    console.log("\n── V2: Rechazo de segundo cierre sin reapertura ─────────────");
    try {
      await cerrarPeriodo({
        weeklyPeriodId: periodo.id,
        tipo: TipoCierre.MANUAL_ADMIN,
        actorId: ADMIN_ID,
        motivo: "intento inválido",
      });
      fail("segundo cierre sin reapertura", "debió lanzar HistorialError(INVALID_STATE)");
    } catch (err) {
      if (err instanceof HistorialError && err.code === "INVALID_STATE") {
        pass(`rechazado con HistorialError(INVALID_STATE): "${err.message.slice(0,60)}…"`);
      } else {
        fail("tipo de error en V2", String(err));
      }
    }

    // ── V3: Reapertura por ADMIN con motivo ───────────────────────────────
    console.log("\n── V3: Reapertura por ADMIN con motivo ──────────────────────");
    const p2 = await reabrirPeriodo({
      weeklyPeriodId: periodo.id,
      adminId: ADMIN_ID,
      motivo: "Corrección de marcación omitida el martes",
      ipAddress: "127.0.0.1",
    });
    if (p2.estado === EstadoPeriodo.REABIERTA) pass(`estado=${p2.estado}`);
    else fail("estado tras reapertura", p2.estado);

    // ── V4: Rechazo de reapertura por SUPERVISOR ──────────────────────────
    console.log("\n── V4: Rechazo de reapertura por SUPERVISOR ─────────────────");
    // Primero cerrar de nuevo para que el test sea válido
    const { periodo: pCerrado2 } = await cerrarPeriodo({
      weeklyPeriodId: periodo.id,
      tipo: TipoCierre.MANUAL_ADMIN,
      actorId: ADMIN_ID,
      motivo: "Re-cierre previo a prueba de SUPERVISOR",
    });
    if (pCerrado2.estado !== EstadoPeriodo.CERRADA) {
      fail("re-cierre para V4", `estado=${pCerrado2.estado}`);
    } else {
      try {
        await reabrirPeriodo({
          weeklyPeriodId: periodo.id,
          adminId: SUPER_ID,  // SUPERVISOR — debe ser rechazado
          motivo: "Intento de reapertura por supervisor",
        });
        fail("reapertura por SUPERVISOR", "debió lanzar HistorialError(ROLE_REQUIRED)");
      } catch (err) {
        if (err instanceof HistorialError && err.code === "ROLE_REQUIRED") {
          pass(`rechazado con HistorialError(ROLE_REQUIRED): "${err.message.slice(0,60)}…"`);
        } else {
          fail("tipo de error en V4", String(err));
        }
      }
    }

    // ── V5: Registro en auditoría de la reapertura V3 ────────────────────
    console.log("\n── V5: Registro en AttendanceAuditLog de reapertura ─────────");
    const auditLog = await db.attendanceAuditLog.findFirst({
      where: {
        adminId: ADMIN_ID,
        accion: "REOPEN_WEEKLY_PERIOD",
      },
      orderBy: { createdAt: "desc" },
    });
    if (!auditLog) {
      fail("audit log de reapertura", "no encontrado");
    } else {
      pass(`log encontrado: id=${auditLog.id.slice(0,8)}…`);
      const previos = auditLog.valoresAnteriores as Record<string,unknown>;
      const nuevos  = auditLog.valoresNuevos    as Record<string,unknown>;
      if (previos?.estado === "CERRADA") pass("valoresAnteriores.estado=CERRADA");
      else fail("valoresAnteriores", JSON.stringify(previos));
      if (nuevos?.estado === "REABIERTA") pass("valoresNuevos.estado=REABIERTA");
      else fail("valoresNuevos", JSON.stringify(nuevos));
      if (previos?.weeklyPeriodId === periodo.id) pass("weeklyPeriodId correcto en audit");
      else fail("weeklyPeriodId en audit", String(previos?.weeklyPeriodId));
    }

    // ── Preparar para V6: reabrir el período cerrado en V4 ───────────────
    console.log("\n── Preparación V6: reabrir para nuevo cierre ────────────────");
    const p3 = await reabrirPeriodo({
      weeklyPeriodId: periodo.id,
      adminId: ADMIN_ID,
      motivo: "Reapertura para verificación V6",
    });
    if (p3.estado === EstadoPeriodo.REABIERTA) pass("período reabierto para V6");
    else fail("reapertura para V6", p3.estado);

    // ── V6: Nuevo cierre tras reapertura → v3 ────────────────────────────
    console.log("\n── V6: Nuevo cierre tras reapertura → v3 ────────────────────");
    const { cierre: c3 } = await cerrarPeriodo({
      weeklyPeriodId: periodo.id,
      tipo: TipoCierre.MANUAL_ADMIN,
      actorId: ADMIN_ID,
      motivo: "Cierre v3 tras reapertura",
    });
    if (c3.version === 3) pass(`version=${c3.version} (v3 correcta)`);
    else fail("versión c3", `esperado 3, obtenido ${c3.version}`);
    if (c3.exitoso) pass("exitoso=true");
    else fail("exitoso c3", "esperado true");

    // ── V7: Conservación de v1 y v2 ──────────────────────────────────────
    console.log("\n── V7: Conservación de versiones anteriores ─────────────────");
    const todosCierres = await listarCierres(periodo.id);
    if (todosCierres.length === 3) pass(`total cierres exitosos = ${todosCierres.length}`);
    else fail("total cierres", `esperado 3, obtenido ${todosCierres.length}`);
    const versiones = todosCierres.map(c => c.version);
    if (JSON.stringify(versiones) === "[1,2,3]") pass(`versiones: ${versiones.join(", ")}`);
    else fail("secuencia de versiones", versiones.join(", "));

    // Verificar que c1 no fue modificado
    const c1Check = await db.weeklyClosure.findUnique({ where: { id: c1.id } });
    if (c1Check?.version === 1 && c1Check.exitoso) pass("v1 intacta tras crear v3");
    else fail("integridad v1", JSON.stringify(c1Check));

    // Verificar obtenerCierreVigente devuelve v3
    const vigente = await obtenerCierreVigente(periodo.id);
    if (vigente?.version === 3) pass(`cierreVigente.version=${vigente.version}`);
    else fail("cierreVigente", `esperado v3, obtenido ${vigente?.version}`);

    // ── V8: Rechazo sobre estados incompatibles ───────────────────────────
    console.log("\n── V8: Rechazo sobre estados incompatibles ──────────────────");
    // Período ya CERRADA → reabrir con motivo vacío debe fallar
    try {
      await reabrirPeriodo({
        weeklyPeriodId: periodo.id,
        adminId: ADMIN_ID,
        motivo: "   ", // solo espacios
      });
      fail("motivo vacío", "debió lanzar HistorialError(MOTIVO_REQUIRED)");
    } catch (err) {
      if (err instanceof HistorialError && err.code === "MOTIVO_REQUIRED") {
        pass("motivo vacío rechazado con MOTIVO_REQUIRED");
      } else {
        fail("tipo de error motivo vacío", String(err));
      }
    }

    // esPeriodoCerrado y permiteModificaciones
    const cerrado = await esPeriodoCerrado(periodo.id);
    if (cerrado) pass("esPeriodoCerrado=true para período CERRADA");
    else fail("esPeriodoCerrado", "esperado true");

    const pFinal = await db.weeklyPeriod.findUnique({ where: { id: periodo.id } });
    if (pFinal && !permiteModificaciones(pFinal)) pass("permiteModificaciones=false para CERRADA");
    else fail("permiteModificaciones", "esperado false para CERRADA");

    // ── V9: Concurrencia — dos cierres simultáneos ───────────────────────
    console.log("\n── V9: Concurrencia — dos cierres simultáneos ───────────────");
    // Reabrir para poder intentar cerrar dos veces concurrentemente
    await reabrirPeriodo({
      weeklyPeriodId: periodo.id,
      adminId: ADMIN_ID,
      motivo: "Reapertura para prueba de concurrencia",
    });

    const results = await Promise.allSettled([
      cerrarPeriodo({
        weeklyPeriodId: periodo.id,
        tipo: TipoCierre.MANUAL_ADMIN,
        actorId: ADMIN_ID,
        motivo: "cierre concurrente A",
      }),
      cerrarPeriodo({
        weeklyPeriodId: periodo.id,
        tipo: TipoCierre.MANUAL_ADMIN,
        actorId: ADMIN_ID,
        motivo: "cierre concurrente B",
      }),
    ]);

    const fulfilled = results.filter(r => r.status === "fulfilled");
    const rejected  = results.filter(r => r.status === "rejected");

    if (fulfilled.length === 1 && rejected.length === 1) {
      pass(`exactamente 1 cierre exitoso y 1 rechazado`);
      const reason = (rejected[0] as PromiseRejectedResult).reason;
      if (reason instanceof HistorialError) {
        pass(`rechazado con HistorialError(${reason.code}): "${reason.message.slice(0,50)}…"`);
      } else {
        // MySQL puede lanzar errores nativos de deadlock también
        pass(`rechazado con error nativo de BD (esperado en concurrencia): ${String(reason).slice(0,80)}`);
      }
    } else if (fulfilled.length === 2) {
      // Verificar que no se crearon versiones duplicadas
      const finalCierres = await listarCierres(periodo.id);
      const versions = finalCierres.map(c => c.version);
      const uniqueVersions = [...new Set(versions)];
      if (uniqueVersions.length === versions.length) {
        pass(`ambos completaron pero sin versiones duplicadas (versiones: ${versions.join(",")})`);
      } else {
        fail("versiones duplicadas en concurrencia", versions.join(","));
      }
    } else {
      fail("resultado inesperado en V9", `fulfilled=${fulfilled.length}, rejected=${rejected.length}`);
    }

  } finally {
    await db.$disconnect();

    console.log("\n── Resultado final ───────────────────────────────────────────");
    if (process.exitCode === 1) {
      console.error("❌ Algunas verificaciones fallaron (ver detalle arriba).");
    } else {
      console.log("✅ Todas las verificaciones completadas correctamente.");
    }

    if (periodoId) {
      console.log(`\n⚠️  DATOS DE PRUEBA en 'intecoal_asistencia':`);
      console.log(`   Tabla weekly_periods: id=${periodoId}`);
      console.log(`   Tabla weekly_closures: weeklyPeriodId=${periodoId}`);
      console.log(`   Tabla attendance_audit_logs: accion=REOPEN_WEEKLY_PERIOD`);
      console.log(`   Para limpiarlos, autoriza la operación de eliminación.`);
    }
  }
}

main().catch(err => {
  console.error("Error inesperado:", err);
  process.exitCode = 1;
});
