-- AlterTable
ALTER TABLE `weekly_consolidado_dia` ADD COLUMN `esNoLaborableCalendario` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `novedadId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `login_throttles` (
    `id` VARCHAR(191) NOT NULL,
    `clave` VARCHAR(64) NOT NULL,
    `tipo` VARCHAR(10) NOT NULL DEFAULT 'CUENTA',
    `intentos` INTEGER NOT NULL DEFAULT 0,
    `ventanaInicio` DATETIME(3) NOT NULL,
    `bloqueadoHasta` DATETIME(3) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `login_throttles_clave_key`(`clave`),
    INDEX `login_throttles_updatedAt_idx`(`updatedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `dias_no_laborables` (
    `id` VARCHAR(191) NOT NULL,
    `fecha` DATE NOT NULL,
    `descripcion` VARCHAR(191) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `creadoPorId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `dias_no_laborables_fecha_key`(`fecha`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `novedades_empleado` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `tipo` ENUM('VACACIONES', 'INCAPACIDAD', 'PERMISO', 'LICENCIA', 'OTRO') NOT NULL,
    `fechaInicio` DATE NOT NULL,
    `fechaFin` DATE NOT NULL,
    `motivo` TEXT NOT NULL,
    `estado` ENUM('PENDIENTE', 'AUTORIZADA', 'RECHAZADA') NOT NULL DEFAULT 'PENDIENTE',
    `registradaPorId` VARCHAR(191) NOT NULL,
    `resueltaPorId` VARCHAR(191) NULL,
    `resueltaEn` DATETIME(3) NULL,
    `motivoDecision` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `novedades_empleado_userId_estado_fechaInicio_fechaFin_idx`(`userId`, `estado`, `fechaInicio`, `fechaFin`),
    INDEX `novedades_empleado_estado_idx`(`estado`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `weekly_consolidado_dia_novedadId_idx` ON `weekly_consolidado_dia`(`novedadId`);

-- AddForeignKey
ALTER TABLE `weekly_consolidado_dia` ADD CONSTRAINT `weekly_consolidado_dia_novedadId_fkey` FOREIGN KEY (`novedadId`) REFERENCES `novedades_empleado`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `dias_no_laborables` ADD CONSTRAINT `dias_no_laborables_creadoPorId_fkey` FOREIGN KEY (`creadoPorId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `novedades_empleado` ADD CONSTRAINT `novedades_empleado_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `novedades_empleado` ADD CONSTRAINT `novedades_empleado_registradaPorId_fkey` FOREIGN KEY (`registradaPorId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `novedades_empleado` ADD CONSTRAINT `novedades_empleado_resueltaPorId_fkey` FOREIGN KEY (`resueltaPorId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

