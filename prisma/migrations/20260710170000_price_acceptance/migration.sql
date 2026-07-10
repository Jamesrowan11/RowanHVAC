ALTER TABLE `Job`
  ADD COLUMN `quotedPrice` DECIMAL(10, 2) NULL,
  ADD COLUMN `acceptToken` VARCHAR(191) NULL,
  ADD COLUMN `priceSentAt` DATETIME(3) NULL,
  ADD COLUMN `priceAcceptedAt` DATETIME(3) NULL,
  ADD COLUMN `priceSignature` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `Job_acceptToken_key` ON `Job`(`acceptToken`);
