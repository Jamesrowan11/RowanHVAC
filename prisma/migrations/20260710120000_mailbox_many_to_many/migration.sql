CREATE TABLE `Mailbox` (
  `id` VARCHAR(191) NOT NULL,
  `address` VARCHAR(255) NOT NULL,
  `encryptedPassword` TEXT NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `Mailbox_address_key`(`address`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `MailboxAccess` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `mailboxId` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `MailboxAccess_userId_mailboxId_key`(`userId`, `mailboxId`),
  INDEX `MailboxAccess_mailboxId_idx`(`mailboxId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `MailboxAccess` ADD CONSTRAINT `MailboxAccess_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `MailboxAccess` ADD CONSTRAINT `MailboxAccess_mailboxId_fkey`
  FOREIGN KEY (`mailboxId`) REFERENCES `Mailbox`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Carry over any mailbox already connected under the old one-user-one-mailbox
-- model: one Mailbox row per distinct address, one MailboxAccess row per
-- existing (user, address) link, so nobody loses their connected mailbox.
INSERT INTO `Mailbox` (`id`, `address`, `encryptedPassword`, `createdAt`, `updatedAt`)
SELECT MIN(`id`), `address`, MIN(`encryptedPassword`), MIN(`createdAt`), MIN(`updatedAt`)
FROM `MailboxLink`
GROUP BY `address`;

INSERT INTO `MailboxAccess` (`id`, `userId`, `mailboxId`, `createdAt`)
SELECT UUID(), ml.`userId`, mb.`id`, ml.`createdAt`
FROM `MailboxLink` ml
JOIN `Mailbox` mb ON mb.`address` = ml.`address`;

DROP TABLE `MailboxLink`;
