-- Customer numbers (used on tickets and in the QuickBooks export)
ALTER TABLE `User` ADD COLUMN `customerNumber` INTEGER NULL;
CREATE UNIQUE INDEX `User_customerNumber_key` ON `User`(`customerNumber`);

-- Backfill existing clients with sequential numbers starting at 1001.
UPDATE `User` u
JOIN (
  SELECT `id`, 1000 + ROW_NUMBER() OVER (ORDER BY `createdAt`) AS rn
  FROM `User` WHERE `role` = 'CLIENT'
) x ON x.`id` = u.`id`
SET u.`customerNumber` = x.rn;

-- Service tickets
CREATE TABLE `ServiceTicket` (
  `id` VARCHAR(191) NOT NULL,
  `ticketNumber` INTEGER NOT NULL AUTO_INCREMENT,
  `status` ENUM('DRAFT', 'SUBMITTED') NOT NULL DEFAULT 'DRAFT',
  `techId` VARCHAR(191) NOT NULL,
  `clientId` VARCHAR(191) NULL,
  `customerName` VARCHAR(191) NOT NULL DEFAULT '',
  `serviceAddress` VARCHAR(300) NOT NULL DEFAULT '',
  `serviceDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `timeIn` DATETIME(3) NULL,
  `timeOut` DATETIME(3) NULL,
  `zone` VARCHAR(191) NULL,
  `techCount` INTEGER NOT NULL DEFAULT 1,
  `ladderUsed` BOOLEAN NOT NULL DEFAULT false,
  `maintenanceVisit` BOOLEAN NOT NULL DEFAULT false,
  `systemType` VARCHAR(191) NULL,
  `brand` VARCHAR(191) NULL,
  `modelNumber` VARCHAR(191) NULL,
  `serialNumber` VARCHAR(191) NULL,
  `ageYears` INTEGER NULL,
  `capRated` VARCHAR(191) NULL,
  `capTested` VARCHAR(191) NULL,
  `suctionBefore` VARCHAR(191) NULL,
  `suctionAfter` VARCHAR(191) NULL,
  `liquidBefore` VARCHAR(191) NULL,
  `liquidAfter` VARCHAR(191) NULL,
  `superheat` VARCHAR(191) NULL,
  `subcooling` VARCHAR(191) NULL,
  `compressorAmps` VARCHAR(191) NULL,
  `fanAmps` VARCHAR(191) NULL,
  `supplyAirTemp` VARCHAR(191) NULL,
  `refrigerantType` VARCHAR(191) NULL,
  `refrigerantLbs` DECIMAL(8, 2) NULL,
  `readingsNotes` TEXT NULL,
  `workPerformed` TEXT NULL,
  `billingStatus` ENUM('BILLABLE', 'NO_CHARGE', 'NEEDS_REVIEW') NOT NULL DEFAULT 'BILLABLE',
  `needsManualPricing` BOOLEAN NOT NULL DEFAULT false,
  `laborTotal` DECIMAL(10, 2) NULL,
  `partsTotal` DECIMAL(10, 2) NULL,
  `total` DECIMAL(10, 2) NULL,
  `submittedAt` DATETIME(3) NULL,
  `exportedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `ServiceTicket_ticketNumber_key`(`ticketNumber`),
  INDEX `ServiceTicket_techId_status_idx`(`techId`, `status`),
  INDEX `ServiceTicket_serviceDate_idx`(`serviceDate`),
  INDEX `ServiceTicket_status_billingStatus_idx`(`status`, `billingStatus`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `TicketLineItem` (
  `id` VARCHAR(191) NOT NULL,
  `ticketId` VARCHAR(191) NOT NULL,
  `kind` VARCHAR(191) NOT NULL,
  `label` VARCHAR(191) NOT NULL,
  `qty` DECIMAL(8, 2) NULL,
  `unitPrice` DECIMAL(10, 2) NULL,
  `amount` DECIMAL(10, 2) NOT NULL,
  `priceItemId` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `TicketLineItem_ticketId_idx`(`ticketId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `LaborRate` (
  `id` VARCHAR(191) NOT NULL,
  `zone` VARCHAR(191) NOT NULL,
  `minutes` INTEGER NOT NULL,
  `price` DECIMAL(10, 2) NOT NULL,
  `twoTechPrice` DECIMAL(10, 2) NULL,
  UNIQUE INDEX `LaborRate_zone_minutes_key`(`zone`, `minutes`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `PriceBookItem` (
  `id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `partNumber` VARCHAR(191) NULL,
  `unit` ENUM('EACH', 'PER_POUND') NOT NULL DEFAULT 'EACH',
  `unitPrice` DECIMAL(10, 2) NOT NULL,
  `active` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Ticket photos hang off the existing Attachment model
ALTER TABLE `Attachment` ADD COLUMN `serviceTicketId` VARCHAR(191) NULL;
CREATE INDEX `Attachment_serviceTicketId_idx` ON `Attachment`(`serviceTicketId`);

ALTER TABLE `ServiceTicket` ADD CONSTRAINT `ServiceTicket_techId_fkey`
  FOREIGN KEY (`techId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `ServiceTicket` ADD CONSTRAINT `ServiceTicket_clientId_fkey`
  FOREIGN KEY (`clientId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `TicketLineItem` ADD CONSTRAINT `TicketLineItem_ticketId_fkey`
  FOREIGN KEY (`ticketId`) REFERENCES `ServiceTicket`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `TicketLineItem` ADD CONSTRAINT `TicketLineItem_priceItemId_fkey`
  FOREIGN KEY (`priceItemId`) REFERENCES `PriceBookItem`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Attachment` ADD CONSTRAINT `Attachment_serviceTicketId_fkey`
  FOREIGN KEY (`serviceTicketId`) REFERENCES `ServiceTicket`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed the labor lookup table with current prices (single-technician).
-- Local Areas: $199 at 30 min, +$53 per 15 min. DC: Local + $50.
INSERT INTO `LaborRate` (`id`, `zone`, `minutes`, `price`) VALUES
  (UUID(), 'Local Areas', 30, 199.00),  (UUID(), 'DC', 30, 249.00),
  (UUID(), 'Local Areas', 45, 252.00),  (UUID(), 'DC', 45, 302.00),
  (UUID(), 'Local Areas', 60, 305.00),  (UUID(), 'DC', 60, 355.00),
  (UUID(), 'Local Areas', 75, 358.00),  (UUID(), 'DC', 75, 408.00),
  (UUID(), 'Local Areas', 90, 411.00),  (UUID(), 'DC', 90, 461.00),
  (UUID(), 'Local Areas', 105, 464.00), (UUID(), 'DC', 105, 514.00),
  (UUID(), 'Local Areas', 120, 517.00), (UUID(), 'DC', 120, 567.00),
  (UUID(), 'Local Areas', 135, 570.00), (UUID(), 'DC', 135, 620.00),
  (UUID(), 'Local Areas', 150, 623.00), (UUID(), 'DC', 150, 673.00),
  (UUID(), 'Local Areas', 165, 676.00), (UUID(), 'DC', 165, 726.00),
  (UUID(), 'Local Areas', 180, 729.00), (UUID(), 'DC', 180, 779.00),
  (UUID(), 'Local Areas', 195, 782.00), (UUID(), 'DC', 195, 832.00),
  (UUID(), 'Local Areas', 210, 835.00), (UUID(), 'DC', 210, 885.00),
  (UUID(), 'Local Areas', 225, 888.00), (UUID(), 'DC', 225, 938.00),
  (UUID(), 'Local Areas', 240, 941.00), (UUID(), 'DC', 240, 991.00),
  (UUID(), 'Local Areas', 255, 994.00), (UUID(), 'DC', 255, 1044.00),
  (UUID(), 'Local Areas', 270, 1047.00),(UUID(), 'DC', 270, 1097.00),
  (UUID(), 'Local Areas', 285, 1100.00),(UUID(), 'DC', 285, 1150.00),
  (UUID(), 'Local Areas', 300, 1153.00),(UUID(), 'DC', 300, 1203.00),
  (UUID(), 'Local Areas', 315, 1206.00),(UUID(), 'DC', 315, 1256.00),
  (UUID(), 'Local Areas', 330, 1259.00),(UUID(), 'DC', 330, 1309.00),
  (UUID(), 'Local Areas', 345, 1312.00),(UUID(), 'DC', 345, 1362.00),
  (UUID(), 'Local Areas', 360, 1365.00),(UUID(), 'DC', 360, 1415.00);

-- Pricing add-ons & rules live in the existing Setting key/value store so
-- admins can edit them without code changes.
INSERT INTO `Setting` (`key`, `value`) VALUES
  ('pricing.ladderFee', '50'),
  ('pricing.maintenanceRate', '489'),
  ('pricing.twoTechMultiplier', '2'),
  ('pricing.roundToMinutes', '15'),
  ('pricing.minimumMinutes', '30'),
  ('pricing.maxMinutes', '360')
ON DUPLICATE KEY UPDATE `value` = `value`;
