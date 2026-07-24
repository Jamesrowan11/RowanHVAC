CREATE TABLE `JobAssignment` (
  `id` VARCHAR(191) NOT NULL,
  `jobId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `JobAssignment_jobId_userId_key`(`jobId`, `userId`),
  INDEX `JobAssignment_userId_idx`(`userId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `JobAssignment` ADD CONSTRAINT `JobAssignment_jobId_fkey`
  FOREIGN KEY (`jobId`) REFERENCES `Job`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `JobAssignment` ADD CONSTRAINT `JobAssignment_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Carry over each job's existing single technician as its first assignment.
INSERT INTO `JobAssignment` (`id`, `jobId`, `userId`, `createdAt`)
SELECT UUID(), `id`, `technicianId`, `updatedAt`
FROM `Job`
WHERE `technicianId` IS NOT NULL;

-- Drop the old single-technician column and its constraints.
ALTER TABLE `Job` DROP FOREIGN KEY `Job_technicianId_fkey`;
ALTER TABLE `Job` DROP INDEX `Job_technicianId_status_idx`;
ALTER TABLE `Job` DROP COLUMN `technicianId`;
