CREATE TABLE `audit_events` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`user_id` bigint unsigned,
	`request_id` varchar(64),
	`event_type` varchar(96) NOT NULL,
	`entity_type` varchar(64),
	`entity_id` varchar(191),
	`safe_detail_json` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `campaign_leads` (
	`campaign_id` bigint unsigned NOT NULL,
	`lead_id` bigint unsigned NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `campaign_leads_pk` UNIQUE(`campaign_id`,`lead_id`)
);
--> statement-breakpoint
CREATE TABLE `campaigns` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`user_id` bigint unsigned NOT NULL,
	`sender_connection_id` bigint unsigned,
	`sheet_binding_id` bigint unsigned,
	`template_id` bigint unsigned,
	`name` varchar(191) NOT NULL,
	`mode` enum('dry_run','live') NOT NULL DEFAULT 'dry_run',
	`approval_policy` enum('manual','automatic') NOT NULL DEFAULT 'manual',
	`status` enum('draft','ready','paused','running','completed','archived') NOT NULL DEFAULT 'draft',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `campaigns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `google_connections` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`user_id` bigint unsigned NOT NULL,
	`provider_subject` varchar(191) NOT NULL,
	`email` varchar(320) NOT NULL,
	`scopes` text NOT NULL,
	`access_token_ciphertext` text NOT NULL,
	`refresh_token_ciphertext` text NOT NULL,
	`token_expires_at` timestamp,
	`status` enum('active','reauthorization_required','revoked') NOT NULL DEFAULT 'active',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`last_validated_at` timestamp,
	CONSTRAINT `google_connections_id` PRIMARY KEY(`id`),
	CONSTRAINT `google_connections_user_subject_uq` UNIQUE(`user_id`,`provider_subject`)
);
--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`user_id` bigint unsigned NOT NULL,
	`campaign_id` bigint unsigned NOT NULL,
	`lead_id` bigint unsigned NOT NULL,
	`status` enum('queued','leased','sending','sent','failed','cancelled','blocked') NOT NULL DEFAULT 'queued',
	`attempt_count` int NOT NULL DEFAULT 0,
	`next_attempt_at` timestamp,
	`lease_owner` varchar(191),
	`lease_expires_at` timestamp,
	`idempotency_key` varchar(191) NOT NULL,
	`provider_message_id` varchar(512),
	`safe_error_code` varchar(64),
	`safe_error_detail` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`completed_at` timestamp,
	CONSTRAINT `jobs_id` PRIMARY KEY(`id`),
	CONSTRAINT `jobs_idempotency_uq` UNIQUE(`idempotency_key`)
);
--> statement-breakpoint
CREATE TABLE `leads` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`user_id` bigint unsigned NOT NULL,
	`sheet_binding_id` bigint unsigned,
	`source_row_key` varchar(191),
	`email` varchar(320) NOT NULL,
	`first_name` varchar(191),
	`last_name` varchar(191),
	`fields_json` text NOT NULL,
	`status` enum('imported','suppressed','invalid','archived') NOT NULL DEFAULT 'imported',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `leads_id` PRIMARY KEY(`id`),
	CONSTRAINT `leads_owner_email_uq` UNIQUE(`user_id`,`email`)
);
--> statement-breakpoint
CREATE TABLE `login_exchange_codes` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`code_hash` varchar(128) NOT NULL,
	`user_id` bigint unsigned NOT NULL,
	`session_id` bigint unsigned NOT NULL,
	`native_return_uri` varchar(512) NOT NULL,
	`expires_at` timestamp NOT NULL,
	`consumed_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `login_exchange_codes_id` PRIMARY KEY(`id`),
	CONSTRAINT `login_exchange_codes_hash_uq` UNIQUE(`code_hash`)
);
--> statement-breakpoint
CREATE TABLE `oauth_login_states` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`state_hash` varchar(128) NOT NULL,
	`native_return_uri` varchar(512) NOT NULL,
	`nonce_hash` varchar(128) NOT NULL,
	`expires_at` timestamp NOT NULL,
	`consumed_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `oauth_login_states_id` PRIMARY KEY(`id`),
	CONSTRAINT `oauth_login_states_hash_uq` UNIQUE(`state_hash`)
);
--> statement-breakpoint
CREATE TABLE `outreach_logs` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`user_id` bigint unsigned NOT NULL,
	`campaign_id` bigint unsigned,
	`lead_id` bigint unsigned,
	`job_id` bigint unsigned,
	`event_type` varchar(64) NOT NULL,
	`provider_message_id` varchar(512),
	`detail_json` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `outreach_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `schema_metadata` (
	`version` varchar(32) NOT NULL,
	`applied_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `schema_metadata_version` PRIMARY KEY(`version`)
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`user_id` bigint unsigned NOT NULL,
	`session_identifier` varchar(64) NOT NULL,
	`token_hash` varchar(128) NOT NULL,
	`expires_at` timestamp NOT NULL,
	`revoked_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`last_seen_at` timestamp,
	CONSTRAINT `sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `sessions_identifier_uq` UNIQUE(`session_identifier`),
	CONSTRAINT `sessions_token_hash_uq` UNIQUE(`token_hash`)
);
--> statement-breakpoint
CREATE TABLE `sheet_bindings` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`user_id` bigint unsigned NOT NULL,
	`google_connection_id` bigint unsigned NOT NULL,
	`spreadsheet_id` varchar(191) NOT NULL,
	`tab_name` varchar(191) NOT NULL,
	`header_mapping_json` text NOT NULL,
	`status` enum('active','invalid','revoked') NOT NULL DEFAULT 'active',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sheet_bindings_id` PRIMARY KEY(`id`),
	CONSTRAINT `sheet_bindings_owner_sheet_uq` UNIQUE(`user_id`,`spreadsheet_id`,`tab_name`)
);
--> statement-breakpoint
CREATE TABLE `templates` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`user_id` bigint unsigned NOT NULL,
	`name` varchar(191) NOT NULL,
	`subject` varchar(998) NOT NULL,
	`body` text NOT NULL,
	`version` int NOT NULL DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `templates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`provider` varchar(32) NOT NULL,
	`provider_subject` varchar(191) NOT NULL,
	`email` varchar(320) NOT NULL,
	`display_name` varchar(191),
	`avatar_url` varchar(512),
	`status` enum('active','disabled') NOT NULL DEFAULT 'active',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`last_login_at` timestamp,
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_provider_subject_uq` UNIQUE(`provider`,`provider_subject`),
	CONSTRAINT `users_email_uq` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `workspace_controls` (
	`user_id` bigint unsigned NOT NULL,
	`paused` boolean NOT NULL DEFAULT false,
	`kill_switch` boolean NOT NULL DEFAULT false,
	`max_concurrent_jobs` int NOT NULL DEFAULT 1,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `workspace_controls_user_id` PRIMARY KEY(`user_id`)
);
--> statement-breakpoint
CREATE INDEX `audit_events_user_created_idx` ON `audit_events` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_events_request_idx` ON `audit_events` (`request_id`);--> statement-breakpoint
CREATE INDEX `campaigns_user_status_idx` ON `campaigns` (`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `campaigns_sender_idx` ON `campaigns` (`sender_connection_id`);--> statement-breakpoint
CREATE INDEX `google_connections_user_idx` ON `google_connections` (`user_id`);--> statement-breakpoint
CREATE INDEX `jobs_claim_idx` ON `jobs` (`status`,`next_attempt_at`,`lease_expires_at`);--> statement-breakpoint
CREATE INDEX `jobs_campaign_idx` ON `jobs` (`campaign_id`,`status`);--> statement-breakpoint
CREATE INDEX `jobs_user_idx` ON `jobs` (`user_id`);--> statement-breakpoint
CREATE INDEX `leads_user_status_idx` ON `leads` (`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `leads_sheet_row_idx` ON `leads` (`sheet_binding_id`,`source_row_key`);--> statement-breakpoint
CREATE INDEX `login_exchange_codes_expiry_idx` ON `login_exchange_codes` (`expires_at`);--> statement-breakpoint
CREATE INDEX `oauth_login_states_expiry_idx` ON `oauth_login_states` (`expires_at`);--> statement-breakpoint
CREATE INDEX `outreach_logs_user_created_idx` ON `outreach_logs` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `outreach_logs_lead_idx` ON `outreach_logs` (`lead_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `sessions_expiry_idx` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE INDEX `sheet_bindings_user_idx` ON `sheet_bindings` (`user_id`);--> statement-breakpoint
CREATE INDEX `templates_user_idx` ON `templates` (`user_id`);--> statement-breakpoint
INSERT INTO `schema_metadata` (`version`) VALUES ('phase4-baseline');
