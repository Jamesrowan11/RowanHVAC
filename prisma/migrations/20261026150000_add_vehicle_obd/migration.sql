-- CreateTable
CREATE TABLE `VehicleSpeed` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `deviceId` VARCHAR(191) NOT NULL,
    `vanName` VARCHAR(120) NOT NULL,
    `driverId` VARCHAR(191) NULL,
    `driverName` VARCHAR(120) NOT NULL,
    `recordedAt` DATETIME(3) NOT NULL,
    `mph` SMALLINT NOT NULL,

    INDEX `VehicleSpeed_vanName_recordedAt_idx`(`vanName`, `recordedAt`),
    UNIQUE INDEX `VehicleSpeed_deviceId_recordedAt_key`(`deviceId`, `recordedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `VehicleCodeReport` (
    `id` VARCHAR(191) NOT NULL,
    `deviceId` VARCHAR(191) NOT NULL,
    `vanName` VARCHAR(120) NOT NULL,
    `driverName` VARCHAR(120) NOT NULL,
    `recordedAt` DATETIME(3) NOT NULL,
    `milOn` BOOLEAN NOT NULL,
    `storedCodes` VARCHAR(1000) NOT NULL,
    `pendingCodes` VARCHAR(1000) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `VehicleCodeReport_vanName_recordedAt_idx`(`vanName`, `recordedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

