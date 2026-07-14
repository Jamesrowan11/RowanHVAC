-- The scheduling letter requires the customer to say how they'll pay at time
-- of service (check or credit card). Captured on the acceptance form.
ALTER TABLE `Job` ADD COLUMN `termsPaymentMethod` VARCHAR(40) NULL;
