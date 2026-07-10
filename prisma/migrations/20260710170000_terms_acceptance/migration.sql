ALTER TABLE `Job`
  ADD COLUMN `acceptToken` VARCHAR(191) NULL,
  ADD COLUMN `termsSentAt` DATETIME(3) NULL,
  ADD COLUMN `termsAcceptedAt` DATETIME(3) NULL,
  ADD COLUMN `termsSignature` VARCHAR(191) NULL,
  ADD COLUMN `termsSnapshot` TEXT NULL;
CREATE UNIQUE INDEX `Job_acceptToken_key` ON `Job`(`acceptToken`);
