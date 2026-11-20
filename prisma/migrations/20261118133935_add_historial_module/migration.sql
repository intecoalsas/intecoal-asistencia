-- CreateTable
CREATE TABLE `weekly_periods` (
    `id` VARCHAR(191) NOT NULL,
    `inicioSemana` DATE NOT NULL,
    `finSemana` DATE NOT NULL,
    `estado` ENUM('ABIERTA', 'PENDIENTE_CIERRE', 'CERRADA', 'REABIERTA') NOT NULL DEFAULT 'ABIERTA',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `weekly_periods_estado_idx`(`estado`),
    INDEX `weekly_periods_finSemana_idx`(`finSemana`),
    UNIQUE INDEX `weekly_periods_inicioSemana_key`(`inicioSemana`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `weekly_closures` (
    `id` VARCHAR(191) NOT NULL,
    `weeklyPeriodId` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL,
    `tipo` ENUM('AUTOMATICO', 'MANUAL_ADMIN') NOT NULL,
    `exitoso` BOOLEAN NOT NULL DEFAULT false,
    `actorId` VARCHAR(191) NULL,
    `motivo` TEXT NULL,
    `cerradoEn` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `weekly_closures_weeklyPeriodId_exitoso_idx`(`weeklyPeriodId`, `exitoso`),
    UNIQUE INDEX `weekly_closures_weeklyPeriodId_version_key`(`weeklyPeriodId`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `weekly_consolidado_dia` (
    `id` VARCHAR(191) NOT NULL,
    `weeklyClosureId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `fechaLaboral` DATE NOT NULL,
    `esLaboral` BOOLEAN NOT NULL DEFAULT false,
    `tieneEntradaManana` BOOLEAN NOT NULL DEFAULT false,
    `tieneSalidaAlmuerzo` BOOLEAN NOT NULL DEFAULT false,
    `tieneEntradaAlmuerzo` BOOLEAN NOT NULL DEFAULT false,
    `tieneSalidaJornada` BOOLEAN NOT NULL DEFAULT false,
    `jornadaCompleta` BOOLEAN NOT NULL DEFAULT false,
    `ausente` BOOLEAN NOT NULL DEFAULT false,
    `tardanzaEntradaMin` INTEGER NOT NULL DEFAULT 0,
    `tardanzaAlmuerzoMin` INTEGER NOT NULL DEFAULT 0,
    `esImpuntual` BOOLEAN NOT NULL DEFAULT false,
    `incidenciasPendientes` INTEGER NOT NULL DEFAULT 0,
    `incidenciasResueltas` INTEGER NOT NULL DEFAULT 0,
    `toleranciaEntradaMin` INTEGER NOT NULL DEFAULT 0,
    `toleranciaAlmuerzoMin` INTEGER NOT NULL DEFAULT 0,
    `schedulePolicyId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `weekly_consolidado_dia_fechaLaboral_userId_idx`(`fechaLaboral`, `userId`),
    INDEX `weekly_consolidado_dia_userId_fechaLaboral_idx`(`userId`, `fechaLaboral`),
    UNIQUE INDEX `weekly_consolidado_dia_weeklyClosureId_userId_fechaLaboral_key`(`weeklyClosureId`, `userId`, `fechaLaboral`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `closure_attempts` (
    `id` VARCHAR(191) NOT NULL,
    `weeklyPeriodId` VARCHAR(191) NOT NULL,
    `intentoNum` INTEGER NOT NULL,
    `resultado` ENUM('EN_PROGRESO', 'EXITO', 'FALLO') NOT NULL DEFAULT 'EN_PROGRESO',
    `errorMsg` TEXT NULL,
    `iniciado` DATETIME(3) NOT NULL,
    `finalizado` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `closure_attempts_weeklyPeriodId_resultado_idx`(`weeklyPeriodId`, `resultado`),
    INDEX `closure_attempts_resultado_idx`(`resultado`),
    UNIQUE INDEX `closure_attempts_weeklyPeriodId_intentoNum_key`(`weeklyPeriodId`, `intentoNum`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `late_marcaciones` (
    `id` VARCHAR(191) NOT NULL,
    `weeklyPeriodId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `tipo` ENUM('ENTRADA_MANANA', 'SALIDA_ALMUERZO', 'ENTRADA_ALMUERZO', 'SALIDA_JORNADA') NOT NULL,
    `fechaLaboral` DATE NOT NULL,
    `timestampRealizacionUTC` DATETIME(3) NOT NULL,
    `timestampRecepcionUTC` DATETIME(3) NOT NULL,
    `kioskId` VARCHAR(191) NULL,
    `estado` ENUM('PENDIENTE', 'INCORPORADA', 'RECHAZADA') NOT NULL DEFAULT 'PENDIENTE',
    `adminId` VARCHAR(191) NULL,
    `motivoRechazo` TEXT NULL,
    `resueltaEn` DATETIME(3) NULL,
    `attendanceId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `late_marcaciones_attendanceId_key`(`attendanceId`),
    INDEX `late_marcaciones_weeklyPeriodId_estado_idx`(`weeklyPeriodId`, `estado`),
    INDEX `late_marcaciones_userId_estado_idx`(`userId`, `estado`),
    UNIQUE INDEX `late_marcaciones_userId_fechaLaboral_tipo_key`(`userId`, `fechaLaboral`, `tipo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `weekly_closures` ADD CONSTRAINT `weekly_closures_weeklyPeriodId_fkey` FOREIGN KEY (`weeklyPeriodId`) REFERENCES `weekly_periods`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `weekly_closures` ADD CONSTRAINT `weekly_closures_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `weekly_consolidado_dia` ADD CONSTRAINT `weekly_consolidado_dia_weeklyClosureId_fkey` FOREIGN KEY (`weeklyClosureId`) REFERENCES `weekly_closures`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `weekly_consolidado_dia` ADD CONSTRAINT `weekly_consolidado_dia_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `weekly_consolidado_dia` ADD CONSTRAINT `weekly_consolidado_dia_schedulePolicyId_fkey` FOREIGN KEY (`schedulePolicyId`) REFERENCES `schedule_policies`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `closure_attempts` ADD CONSTRAINT `closure_attempts_weeklyPeriodId_fkey` FOREIGN KEY (`weeklyPeriodId`) REFERENCES `weekly_periods`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `late_marcaciones` ADD CONSTRAINT `late_marcaciones_weeklyPeriodId_fkey` FOREIGN KEY (`weeklyPeriodId`) REFERENCES `weekly_periods`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `late_marcaciones` ADD CONSTRAINT `late_marcaciones_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `late_marcaciones` ADD CONSTRAINT `late_marcaciones_kioskId_fkey` FOREIGN KEY (`kioskId`) REFERENCES `kiosk_devices`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `late_marcaciones` ADD CONSTRAINT `late_marcaciones_adminId_fkey` FOREIGN KEY (`adminId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `late_marcaciones` ADD CONSTRAINT `late_marcaciones_attendanceId_fkey` FOREIGN KEY (`attendanceId`) REFERENCES `attendances`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
