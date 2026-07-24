-- CreateTable
CREATE TABLE `ServiceArea` (
    `id` VARCHAR(191) NOT NULL,
    `region` VARCHAR(191) NOT NULL,
    `town` VARCHAR(191) NOT NULL,
    `zips` TEXT NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,

    INDEX `ServiceArea_active_idx`(`active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
