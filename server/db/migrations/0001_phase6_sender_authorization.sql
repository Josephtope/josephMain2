CREATE TABLE `google_connection_states` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`state_hash` varchar(128) NOT NULL,
	`user_id` bigint unsigned NOT NULL,
	`session_identifier` varchar(64) NOT NULL,
	`native_return_uri` varchar(512) NOT NULL,
	`nonce_hash` varchar(128) NOT NULL,
	`expires_at` timestamp NOT NULL,
	`consumed_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `google_connection_states_id` PRIMARY KEY(`id`),
	CONSTRAINT `google_connection_states_hash_uq` UNIQUE(`state_hash`)
);
--> statement-breakpoint
CREATE INDEX `google_connection_states_expiry_idx` ON `google_connection_states` (`expires_at`);--> statement-breakpoint
CREATE INDEX `google_connection_states_user_idx` ON `google_connection_states` (`user_id`);--> statement-breakpoint
INSERT INTO `schema_metadata` (`version`) VALUES ('phase6-sender-authorization');
