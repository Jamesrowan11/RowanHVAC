CREATE TABLE `Proposal` (
  `id` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191) NOT NULL DEFAULT 'Proposal',
  `date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `clientId` VARCHAR(191) NULL,
  `customerName` VARCHAR(191) NOT NULL DEFAULT '',
  `phone` VARCHAR(191) NULL,
  `email` VARCHAR(191) NULL,
  `address` VARCHAR(400) NOT NULL DEFAULT '',
  `body` TEXT NOT NULL,
  `price` VARCHAR(191) NULL,
  `paymentTerms` TEXT NULL,
  `note` TEXT NULL,
  `createdById` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `Proposal_clientId_idx`(`clientId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Proposal` ADD CONSTRAINT `Proposal_clientId_fkey`
  FOREIGN KEY (`clientId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Proposal` ADD CONSTRAINT `Proposal_createdById_fkey`
  FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
