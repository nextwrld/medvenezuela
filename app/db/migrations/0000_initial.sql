CREATE TABLE `local_users` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`username` varchar(100) NOT NULL,
	`passwordHash` varchar(255) NOT NULL,
	`displayName` varchar(255),
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `local_users_id` PRIMARY KEY(`id`),
	CONSTRAINT `local_users_username_unique` UNIQUE(`username`)
);
--> statement-breakpoint
CREATE TABLE `solicitudes` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`medicamento` varchar(255) NOT NULL,
	`principioActivo` varchar(255) NOT NULL,
	`cantidad` varchar(100) NOT NULL,
	`dosis` varchar(100),
	`hospital` varchar(255) NOT NULL,
	`estado` varchar(100) NOT NULL,
	`ciudad` varchar(100) NOT NULL,
	`telefono` varchar(50) NOT NULL,
	`nombreSolicitante` varchar(255) NOT NULL,
	`rolSolicitante` enum('medico','familiar','personal_salud') NOT NULL,
	`inicialesPaciente` varchar(50),
	`urgencia` enum('critico','moderado','estable') NOT NULL DEFAULT 'moderado',
	`estatus` enum('activo','en_proceso','recibido') NOT NULL DEFAULT 'activo',
	`pinGestion` varchar(8) NOT NULL,
	`notas` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `solicitudes_id` PRIMARY KEY(`id`),
	CONSTRAINT `solicitudes_pin_gestion_unique` UNIQUE(`pinGestion`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`unionId` varchar(255) NOT NULL,
	`name` varchar(255),
	`email` varchar(320),
	`avatar` text,
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	`lastSignInAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_unionId_unique` UNIQUE(`unionId`)
);
