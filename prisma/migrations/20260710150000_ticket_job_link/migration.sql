-- Tie service tickets to the schedule event (Job) they document.
ALTER TABLE `ServiceTicket` ADD COLUMN `jobId` VARCHAR(191) NULL;
CREATE INDEX `ServiceTicket_jobId_idx` ON `ServiceTicket`(`jobId`);
ALTER TABLE `ServiceTicket` ADD CONSTRAINT `ServiceTicket_jobId_fkey`
  FOREIGN KEY (`jobId`) REFERENCES `Job`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
