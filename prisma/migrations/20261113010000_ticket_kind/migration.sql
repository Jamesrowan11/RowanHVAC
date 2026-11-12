-- Service tickets and maintenance inspection reports share one table.
ALTER TABLE `ServiceTicket` ADD COLUMN `kind` VARCHAR(20) NOT NULL DEFAULT 'service';
