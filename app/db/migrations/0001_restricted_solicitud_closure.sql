CREATE TABLE `solicitudClosureAttempts` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`solicitudId` int NOT NULL,
	`identifierHash` varchar(64) NOT NULL,
	`windowStartsAt` timestamp NOT NULL DEFAULT (now()),
	`attemptCount` int NOT NULL DEFAULT 0,
	CONSTRAINT `solicitudClosureAttempts_id` PRIMARY KEY(`id`),
	CONSTRAINT `solicitud_closure_attempts_unique` UNIQUE(`solicitudId`,`identifierHash`)
);
--> statement-breakpoint
CREATE TABLE `solicitudClosureAudit` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`solicitudId` int NOT NULL,
	`actorUserId` int NOT NULL,
	`actorName` varchar(255),
	`action` enum('admin_close') NOT NULL,
	`reason` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `solicitudClosureAudit_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `solicitudes` ADD `pinCierre` varchar(8);--> statement-breakpoint
ALTER TABLE `solicitudes` ADD `notasCierre` text;--> statement-breakpoint
ALTER TABLE `solicitudes` ADD `closedAt` timestamp;--> statement-breakpoint
CREATE INDEX `solicitud_closure_attempts_solicitud_idx` ON `solicitudClosureAttempts` (`solicitudId`);