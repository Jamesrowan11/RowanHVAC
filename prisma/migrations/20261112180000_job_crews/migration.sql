-- Jobs can have several technicians. Every job keeps the technician it had
-- (copied into JobTechnician first), then the single-technician column goes.

-- CreateTable
CREATE TABLE `JobTechnician` (
    `jobId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `position` INTEGER NOT NULL DEFAULT 0,

    INDEX `JobTechnician_userId_idx`(`userId`),
    PRIMARY KEY (`jobId`, `userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `JobTechnician` ADD CONSTRAINT `JobTechnician_jobId_fkey` FOREIGN KEY (`jobId`) REFERENCES `Job`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `JobTechnician` ADD CONSTRAINT `JobTechnician_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Keep every existing assignment.
INSERT INTO `JobTechnician` (`jobId`, `userId`, `position`)
SELECT `id`, `technicianId`, 0 FROM `Job` WHERE `technicianId` IS NOT NULL;

-- DropForeignKey
ALTER TABLE `Job` DROP FOREIGN KEY `Job_technicianId_fkey`;

-- DropIndex
DROP INDEX `Job_technicianId_idx` ON `Job`;

-- AlterTable
ALTER TABLE `Job` DROP COLUMN `technicianId`;
