// src/modules/historial/periodo-tx.service.ts
/**
 * Pasos transaccionales compartidos para modificar una semana CERRADA dentro
 * de UNA transacción Serializable del llamador:
 *   reabrirPeriodoEnTx → (modificación) → cerrarPeriodoEnTx
 * y, ya fuera de la transacción, consolidarConRegistro.
 *
 * Reproducen exactamente los efectos de reabrirPeriodo / cerrarPeriodo
 * (que abren su propia transacción y no aceptan un cliente transaccional):
 *  - Reapertura: CERRADA → REABIERTA + AttendanceAuditLog REOPEN_WEEKLY_PERIOD.
 *  - Cierre: WeeklyClosure MANUAL_ADMIN con version = MAX + 1 → CERRADA.
 *
 * Extraído de incorporarMarcacion (marcaciones tardías) para reutilizarlo en la
 * corrección auditada de marcaciones sin duplicar lógica.
 */
import { Prisma, EstadoPeriodo, TipoCierre, ResultadoIntento, WeeklyClosure } from "@prisma/client";
import { db } from "@/lib/db";
import { consolidarPeriodo } from "./consolidado.service";

type Tx = Prisma.TransactionClient;

/** Reapertura auditada (mismos efectos que reabrirPeriodo). */
export async function reabrirPeriodoEnTx(
  tx: Tx,
  weeklyPeriodId: string,
  adminId: string,
  motivo: string
): Promise<void> {
  await tx.weeklyPeriod.update({
    where: { id: weeklyPeriodId },
    data: { estado: EstadoPeriodo.REABIERTA },
  });
  await tx.attendanceAuditLog.create({
    data: {
      adminId,
      accion: "REOPEN_WEEKLY_PERIOD",
      motivo,
      valoresAnteriores: { weeklyPeriodId, estado: EstadoPeriodo.CERRADA },
      valoresNuevos: { weeklyPeriodId, estado: EstadoPeriodo.REABIERTA },
    },
  });
}

/** Nueva versión de cierre MANUAL_ADMIN (mismos efectos que cerrarPeriodo). */
export async function cerrarPeriodoEnTx(
  tx: Tx,
  weeklyPeriodId: string,
  actorId: string,
  motivo: string
): Promise<WeeklyClosure> {
  const max = await tx.weeklyClosure.aggregate({
    where: { weeklyPeriodId },
    _max: { version: true },
  });
  const cierre = await tx.weeklyClosure.create({
    data: {
      weeklyPeriodId,
      version: (max._max.version ?? 0) + 1,
      tipo: TipoCierre.MANUAL_ADMIN,
      exitoso: true,
      actorId,
      motivo,
      cerradoEn: new Date(),
    },
  });
  await tx.weeklyPeriod.update({
    where: { id: weeklyPeriodId },
    data: { estado: EstadoPeriodo.CERRADA },
  });
  return cierre;
}

/**
 * Deja constancia persistente de una consolidación fallida usando el mismo
 * mecanismo que ejecutarCierrePeriodo: un ClosureAttempt FALLO con errorMsg
 * "CONSOLIDACION_FALLIDA (cierreId=...)". No crea ni modifica WeeklyClosure y
 * no altera el cron. Best-effort: nunca lanza.
 */
export async function registrarConsolidacionFallida(
  weeklyPeriodId: string,
  cierreId: string,
  iniciado: Date,
  causa: unknown,
  origen: string
): Promise<void> {
  const errorMsg =
    `CONSOLIDACION_FALLIDA (cierreId=${cierreId}): ` +
    (causa instanceof Error ? causa.message : String(causa)) +
    ` [origen: ${origen}]`;

  for (let intento = 0; intento < 3; intento++) {
    try {
      await db.$transaction(
        async (tx) => {
          const agg = await tx.closureAttempt.aggregate({
            where: { weeklyPeriodId },
            _max: { intentoNum: true },
          });
          await tx.closureAttempt.create({
            data: {
              weeklyPeriodId,
              intentoNum: (agg._max.intentoNum ?? 0) + 1,
              resultado: ResultadoIntento.FALLO,
              iniciado,
              finalizado: new Date(),
              errorMsg,
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );
      return;
    } catch (err) {
      const e = err as { code?: string };
      // P2002: colisión de intentoNum; P2034: conflicto de serialización → reintentar
      if (e.code === "P2002" || e.code === "P2034") continue;
      console.error(
        `[historial] No se pudo registrar CONSOLIDACION_FALLIDA para cierreId=${cierreId}:`,
        err
      );
      return;
    }
  }
  console.error(
    `[historial] No se pudo registrar CONSOLIDACION_FALLIDA para cierreId=${cierreId} tras 3 intentos.`
  );
}

/**
 * Consolida una versión de cierre ya confirmada (fuera de la transacción,
 * idempotente). Si falla, no revierte el cierre: deja el registro persistente
 * para recuperarConsolidacion.
 */
export async function consolidarConRegistro(
  cierreId: string,
  weeklyPeriodId: string,
  origen: string
): Promise<void> {
  const inicio = new Date();
  try {
    await consolidarPeriodo(cierreId, weeklyPeriodId);
  } catch (err) {
    console.error(
      `[historial] Consolidación falló para cierreId=${cierreId}. ` +
        `Ejecutar recuperarConsolidacion("${cierreId}", "${weeklyPeriodId}").`,
      err
    );
    await registrarConsolidacionFallida(weeklyPeriodId, cierreId, inicio, err, origen);
  }
}
