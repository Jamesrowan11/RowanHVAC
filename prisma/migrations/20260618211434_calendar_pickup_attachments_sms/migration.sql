-- AlterTable
ALTER TABLE `Job` ADD COLUMN `endAt` DATETIME(3) NULL,
    ADD COLUMN `kind` ENUM('SERVICE', 'PICKUP') NOT NULL DEFAULT 'SERVICE';

-- CreateTable
CREATE TABLE `Attachment` (
    `id` VARCHAR(191) NOT NULL,
    `jobNoteId` VARCHAR(191) NULL,
    `messageId` VARCHAR(191) NULL,
    `fileName` VARCHAR(191) NOT NULL,
    `storagePath` VARCHAR(191) NOT NULL,
    `mimeType` VARCHAR(191) NOT NULL,
    `size` INTEGER NOT NULL,
    `uploadedById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Attachment_jobNoteId_idx`(`jobNoteId`),
    INDEX `Attachment_messageId_idx`(`messageId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SmsLog` (
    `id` VARCHAR(191) NOT NULL,
    `senderUserId` VARCHAR(191) NULL,
    `toNumbers` TEXT NOT NULL,
    `body` TEXT NOT NULL,
    `status` ENUM('SENT', 'LOGGED', 'FAILED') NOT NULL,
    `error` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SmsLog_senderUserId_idx`(`senderUserId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Attachment` ADD CONSTRAINT `Attachment_jobNoteId_fkey` FOREIGN KEY (`jobNoteId`) REFERENCES `JobNote`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Attachment` ADD CONSTRAINT `Attachment_messageId_fkey` FOREIGN KEY (`messageId`) REFERENCES `Message`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
