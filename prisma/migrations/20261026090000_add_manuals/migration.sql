-- CreateTable
CREATE TABLE `Manual` (
    `id` VARCHAR(191) NOT NULL,
    `brand` VARCHAR(120) NOT NULL,
    `model` VARCHAR(160) NOT NULL,
    `equipmentType` VARCHAR(60) NOT NULL,
    `title` VARCHAR(255) NULL,
    `originalName` VARCHAR(400) NOT NULL,
    `storedName` VARCHAR(191) NOT NULL,
    `mimeType` VARCHAR(191) NOT NULL,
    `size` INTEGER NOT NULL,
    `sha256` CHAR(64) NOT NULL,
    `uploadedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Manual_brand_model_idx`(`brand`, `model`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Manual` ADD CONSTRAINT `Manual_uploadedById_fkey` FOREIGN KEY (`uploadedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

