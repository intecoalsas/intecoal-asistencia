-- CreateTable
CREATE TABLE `used_qr_tokens` (
    `userId` VARCHAR(191) NOT NULL,
    `jti` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `used_qr_tokens_expiresAt_idx`(`expiresAt`),
    UNIQUE INDEX `used_qr_tokens_userId_jti_key`(`userId`, `jti`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
