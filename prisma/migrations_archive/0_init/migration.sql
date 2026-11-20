-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'SUPERVISOR', 'EMPLEADO', 'KIOSCO');

-- CreateEnum
CREATE TYPE "TipoMarcacion" AS ENUM ('ENTRADA_MANANA', 'SALIDA_ALMUERZO', 'ENTRADA_ALMUERZO', 'SALIDA_JORNADA');

-- CreateEnum
CREATE TYPE "EstadoMarcacion" AS ENUM ('ORIGINAL', 'CORREGIDO', 'ANULADO');

-- CreateEnum
CREATE TYPE "PuntualidadEstado" AS ENUM ('A_TIEMPO', 'RETARDO', 'ANTICIPADO', 'NO_APLICA');

-- CreateEnum
CREATE TYPE "TipoIncidencia" AS ENUM ('MARCACION_FALTANTE', 'FUERA_DE_SECUENCIA', 'HORA_ATIPICA', 'DUPLICADO_INTENTADO');

-- CreateEnum
CREATE TYPE "EstadoIncidencia" AS ENUM ('PENDIENTE', 'JUSTIFICADA', 'RESUELTA', 'RECHAZADA');

-- CreateEnum
CREATE TYPE "DiaSemana" AS ENUM ('LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "documento" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "apellido" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'EMPLEADO',
    "cargo" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kiosk_devices" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "ubicacion" TEXT NOT NULL,
    "secretKey" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "ipPermitida" TEXT,
    "ultimoHeartbeat" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kiosk_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_policies" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "toleranciaEntradaMinutos" INTEGER NOT NULL DEFAULT 10,
    "toleranciaAlmuerzoMinutos" INTEGER NOT NULL DEFAULT 10,
    "minimoMinutosAlmuerzo" INTEGER NOT NULL DEFAULT 45,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schedule_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_day_rules" (
    "id" TEXT NOT NULL,
    "schedulePolicyId" TEXT NOT NULL,
    "dia" "DiaSemana" NOT NULL,
    "horaEntradaManana" TEXT NOT NULL,
    "horaSalidaAlmuerzo" TEXT NOT NULL,
    "horaEntradaAlmuerzo" TEXT NOT NULL,
    "horaSalidaJornada" TEXT NOT NULL,
    "esLaboral" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "schedule_day_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_schedule_assignments" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "schedulePolicyId" TEXT NOT NULL,
    "validFrom" DATE NOT NULL,
    "validUntil" DATE,
    "toleranciaPersonalizadaMin" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_schedule_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendances" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kioskId" TEXT,
    "tipo" "TipoMarcacion" NOT NULL,
    "fechaLaboral" DATE NOT NULL,
    "timestampUTC" TIMESTAMP(3) NOT NULL,
    "timestampLocal" TIMESTAMP(3) NOT NULL,
    "estado" "EstadoMarcacion" NOT NULL DEFAULT 'ORIGINAL',
    "idempotencyKey" TEXT NOT NULL,
    "puntualidad" "PuntualidadEstado" NOT NULL DEFAULT 'A_TIEMPO',
    "minutosDiferencia" INTEGER NOT NULL DEFAULT 0,
    "esOriginal" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_incidents" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "attendanceId" TEXT,
    "fechaLaboral" DATE NOT NULL,
    "tipo" "TipoIncidencia" NOT NULL,
    "estado" "EstadoIncidencia" NOT NULL DEFAULT 'PENDIENTE',
    "descripcion" TEXT NOT NULL,
    "resolucion" TEXT,
    "resueltoPorId" TEXT,
    "resueltoEn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_audit_logs" (
    "id" TEXT NOT NULL,
    "attendanceId" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "accion" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "valoresAnteriores" JSONB NOT NULL,
    "valoresNuevos" JSONB NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_documento_key" ON "users"("documento");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_documento_idx" ON "users"("documento");

-- CreateIndex
CREATE INDEX "users_role_isActive_idx" ON "users"("role", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "kiosk_devices_codigo_key" ON "kiosk_devices"("codigo");

-- CreateIndex
CREATE INDEX "kiosk_devices_codigo_isActive_idx" ON "kiosk_devices"("codigo", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "schedule_policies_nombre_key" ON "schedule_policies"("nombre");

-- CreateIndex
CREATE INDEX "schedule_day_rules_schedulePolicyId_dia_idx" ON "schedule_day_rules"("schedulePolicyId", "dia");

-- CreateIndex
CREATE UNIQUE INDEX "schedule_day_rules_schedulePolicyId_dia_key" ON "schedule_day_rules"("schedulePolicyId", "dia");

-- CreateIndex
CREATE INDEX "employee_schedule_assignments_userId_validFrom_validUntil_idx" ON "employee_schedule_assignments"("userId", "validFrom", "validUntil");

-- CreateIndex
CREATE INDEX "employee_schedule_assignments_schedulePolicyId_idx" ON "employee_schedule_assignments"("schedulePolicyId");

-- CreateIndex
CREATE UNIQUE INDEX "attendances_idempotencyKey_key" ON "attendances"("idempotencyKey");

-- CreateIndex
CREATE INDEX "attendances_userId_fechaLaboral_idx" ON "attendances"("userId", "fechaLaboral");

-- CreateIndex
CREATE INDEX "attendances_fechaLaboral_tipo_idx" ON "attendances"("fechaLaboral", "tipo");

-- CreateIndex
CREATE INDEX "attendances_timestampUTC_idx" ON "attendances"("timestampUTC");

-- CreateIndex
CREATE UNIQUE INDEX "attendances_userId_fechaLaboral_tipo_key" ON "attendances"("userId", "fechaLaboral", "tipo");

-- CreateIndex
CREATE INDEX "attendance_incidents_userId_fechaLaboral_idx" ON "attendance_incidents"("userId", "fechaLaboral");

-- CreateIndex
CREATE INDEX "attendance_incidents_estado_tipo_idx" ON "attendance_incidents"("estado", "tipo");

-- CreateIndex
CREATE INDEX "attendance_incidents_fechaLaboral_idx" ON "attendance_incidents"("fechaLaboral");

-- CreateIndex
CREATE INDEX "attendance_audit_logs_attendanceId_idx" ON "attendance_audit_logs"("attendanceId");

-- CreateIndex
CREATE INDEX "attendance_audit_logs_adminId_idx" ON "attendance_audit_logs"("adminId");

-- CreateIndex
CREATE INDEX "attendance_audit_logs_createdAt_idx" ON "attendance_audit_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "schedule_day_rules" ADD CONSTRAINT "schedule_day_rules_schedulePolicyId_fkey" FOREIGN KEY ("schedulePolicyId") REFERENCES "schedule_policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_schedule_assignments" ADD CONSTRAINT "employee_schedule_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_schedule_assignments" ADD CONSTRAINT "employee_schedule_assignments_schedulePolicyId_fkey" FOREIGN KEY ("schedulePolicyId") REFERENCES "schedule_policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_kioskId_fkey" FOREIGN KEY ("kioskId") REFERENCES "kiosk_devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_incidents" ADD CONSTRAINT "attendance_incidents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_incidents" ADD CONSTRAINT "attendance_incidents_attendanceId_fkey" FOREIGN KEY ("attendanceId") REFERENCES "attendances"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_incidents" ADD CONSTRAINT "attendance_incidents_resueltoPorId_fkey" FOREIGN KEY ("resueltoPorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_audit_logs" ADD CONSTRAINT "attendance_audit_logs_attendanceId_fkey" FOREIGN KEY ("attendanceId") REFERENCES "attendances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_audit_logs" ADD CONSTRAINT "attendance_audit_logs_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
