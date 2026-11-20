-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(191) NOT NULL,
    `documento` VARCHAR(191) NOT NULL,
    `nombre` VARCHAR(191) NOT NULL,
    `apellido` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `role` ENUM('ADMIN', 'SUPERVISOR', 'EMPLEADO', 'KIOSCO') NOT NULL DEFAULT 'EMPLEADO',
    `cargo` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_documento_key`(`documento`),
    UNIQUE INDEX `users_email_key`(`email`),
    INDEX `users_role_isActive_idx`(`role`, `isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `kiosk_devices` (
    `id` VARCHAR(191) NOT NULL,
    `codigo` VARCHAR(191) NOT NULL,
    `nombre` VARCHAR(191) NOT NULL,
    `ubicacion` VARCHAR(191) NOT NULL,
    `secretKey` VARCHAR(191) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `ipPermitida` VARCHAR(191) NULL,
    `ultimoHeartbeat` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `kiosk_devices_codigo_key`(`codigo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `schedule_policies` (
    `id` VARCHAR(191) NOT NULL,
    `nombre` VARCHAR(191) NOT NULL,
    `descripcion` VARCHAR(191) NULL,
    `toleranciaEntradaMinutos` INTEGER NOT NULL DEFAULT 10,
    `toleranciaAlmuerzoMinutos` INTEGER NOT NULL DEFAULT 10,
    `minimoMinutosAlmuerzo` INTEGER NOT NULL DEFAULT 45,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `schedule_policies_nombre_key`(`nombre`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `schedule_day_rules` (
    `id` VARCHAR(191) NOT NULL,
    `schedulePolicyId` VARCHAR(191) NOT NULL,
    `dia` ENUM('LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO') NOT NULL,
    `horaEntradaManana` VARCHAR(191) NOT NULL,
    `horaSalidaAlmuerzo` VARCHAR(191) NOT NULL,
    `horaEntradaAlmuerzo` VARCHAR(191) NOT NULL,
    `horaSalidaJornada` VARCHAR(191) NOT NULL,
    `esLaboral` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `schedule_day_rules_schedulePolicyId_dia_key`(`schedulePolicyId`, `dia`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `employee_schedule_assignments` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `schedulePolicyId` VARCHAR(191) NOT NULL,
    `validFrom` DATE NOT NULL,
    `validUntil` DATE NULL,
    `toleranciaPersonalizadaMin` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `employee_schedule_assignments_userId_validFrom_validUntil_idx`(`userId`, `validFrom`, `validUntil`),
    INDEX `employee_schedule_assignments_schedulePolicyId_idx`(`schedulePolicyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `attendances` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `kioskId` VARCHAR(191) NULL,
    `tipo` ENUM('ENTRADA_MANANA', 'SALIDA_ALMUERZO', 'ENTRADA_ALMUERZO', 'SALIDA_JORNADA') NOT NULL,
    `fechaLaboral` DATE NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `currentVersionId` VARCHAR(191) NULL,

    UNIQUE INDEX `attendances_currentVersionId_key`(`currentVersionId`),
    INDEX `attendances_fechaLaboral_tipo_idx`(`fechaLaboral`, `tipo`),
    UNIQUE INDEX `attendances_userId_fechaLaboral_tipo_key`(`userId`, `fechaLaboral`, `tipo`),
    UNIQUE INDEX `attendances_id_currentVersionId_key`(`id`, `currentVersionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `attendance_versions` (
    `id` VARCHAR(191) NOT NULL,
    `attendanceId` VARCHAR(191) NOT NULL,
    `versionNumber` INTEGER NOT NULL,
    `tipo` ENUM('ENTRADA_MANANA', 'SALIDA_ALMUERZO', 'ENTRADA_ALMUERZO', 'SALIDA_JORNADA') NOT NULL,
    `timestampUTC` DATETIME(3) NOT NULL,
    `estado` ENUM('ORIGINAL', 'CORREGIDO', 'ANULADO') NOT NULL,
    `puntualidad` ENUM('A_TIEMPO', 'RETARDO', 'ANTICIPADO', 'NO_APLICA') NOT NULL,
    `minutosDiferencia` INTEGER NOT NULL,
    `esOriginal` BOOLEAN NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `idempotencyKey` VARCHAR(191) NOT NULL,
    `payloadHash` VARCHAR(191) NOT NULL,
    `auditLogId` VARCHAR(191) NULL,

    UNIQUE INDEX `attendance_versions_idempotencyKey_key`(`idempotencyKey`),
    UNIQUE INDEX `attendance_versions_auditLogId_key`(`auditLogId`),
    INDEX `attendance_versions_attendanceId_idx`(`attendanceId`),
    UNIQUE INDEX `attendance_versions_attendanceId_versionNumber_key`(`attendanceId`, `versionNumber`),
    UNIQUE INDEX `attendance_versions_attendanceId_id_key`(`attendanceId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `attendance_incidents` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `attendanceId` VARCHAR(191) NULL,
    `fechaLaboral` DATE NOT NULL,
    `tipo` ENUM('MARCACION_FALTANTE', 'FUERA_DE_SECUENCIA', 'HORA_ATIPICA', 'DUPLICADO_INTENTADO') NOT NULL,
    `estado` ENUM('PENDIENTE', 'JUSTIFICADA', 'RESUELTA', 'RECHAZADA') NOT NULL DEFAULT 'PENDIENTE',
    `descripcion` TEXT NOT NULL,
    `resolucion` TEXT NULL,
    `resueltoPorId` VARCHAR(191) NULL,
    `resueltoEn` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `attendance_incidents_estado_tipo_idx`(`estado`, `tipo`),
    INDEX `attendance_incidents_fechaLaboral_idx`(`fechaLaboral`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `attendance_audit_logs` (
    `id` VARCHAR(191) NOT NULL,
    `attendanceId` VARCHAR(191) NULL,
    `incidentId` VARCHAR(191) NULL,
    `adminId` VARCHAR(191) NOT NULL,
    `accion` VARCHAR(191) NOT NULL,
    `motivo` TEXT NOT NULL,
    `valoresAnteriores` JSON NOT NULL,
    `valoresNuevos` JSON NOT NULL,
    `ipAddress` VARCHAR(191) NULL,
    `userAgent` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `attendance_audit_logs_attendanceId_idx`(`attendanceId`),
    INDEX `attendance_audit_logs_incidentId_idx`(`incidentId`),
    INDEX `attendance_audit_logs_adminId_idx`(`adminId`),
    INDEX `attendance_audit_logs_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `schedule_day_rules` ADD CONSTRAINT `schedule_day_rules_schedulePolicyId_fkey` FOREIGN KEY (`schedulePolicyId`) REFERENCES `schedule_policies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `employee_schedule_assignments` ADD CONSTRAINT `employee_schedule_assignments_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `employee_schedule_assignments` ADD CONSTRAINT `employee_schedule_assignments_schedulePolicyId_fkey` FOREIGN KEY (`schedulePolicyId`) REFERENCES `schedule_policies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendances` ADD CONSTRAINT `attendances_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendances` ADD CONSTRAINT `attendances_kioskId_fkey` FOREIGN KEY (`kioskId`) REFERENCES `kiosk_devices`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendances` ADD CONSTRAINT `attendances_id_currentVersionId_fkey` FOREIGN KEY (`id`, `currentVersionId`) REFERENCES `attendance_versions`(`attendanceId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendance_versions` ADD CONSTRAINT `attendance_versions_attendanceId_fkey` FOREIGN KEY (`attendanceId`) REFERENCES `attendances`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendance_versions` ADD CONSTRAINT `attendance_versions_auditLogId_fkey` FOREIGN KEY (`auditLogId`) REFERENCES `attendance_audit_logs`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendance_incidents` ADD CONSTRAINT `attendance_incidents_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendance_incidents` ADD CONSTRAINT `attendance_incidents_attendanceId_fkey` FOREIGN KEY (`attendanceId`) REFERENCES `attendances`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendance_incidents` ADD CONSTRAINT `attendance_incidents_resueltoPorId_fkey` FOREIGN KEY (`resueltoPorId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendance_audit_logs` ADD CONSTRAINT `attendance_audit_logs_attendanceId_fkey` FOREIGN KEY (`attendanceId`) REFERENCES `attendances`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendance_audit_logs` ADD CONSTRAINT `attendance_audit_logs_incidentId_fkey` FOREIGN KEY (`incidentId`) REFERENCES `attendance_incidents`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendance_audit_logs` ADD CONSTRAINT `attendance_audit_logs_adminId_fkey` FOREIGN KEY (`adminId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

