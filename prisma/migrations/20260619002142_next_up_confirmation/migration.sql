-- "You're next" customer confirmation fields on Job
ALTER TABLE `Job`
  ADD COLUMN `confirmToken` VARCHAR(191) NULL,
  ADD COLUMN `confirmStatus` VARCHAR(191) NULL,
  ADD COLUMN `confirmAskedAt` DATETIME(3) NULL,
  ADD COLUMN `confirmRespondedAt` DATETIME(3) NULL;

CREATE UNIQUE INDEX `Job_confirmToken_key` ON `Job`(`confirmToken`);
