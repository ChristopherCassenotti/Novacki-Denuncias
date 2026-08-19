-- CreateTable
CREATE TABLE `audit_logs` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `actor_type` ENUM('ADMIN', 'SYSTEM') NOT NULL,
    `actor_user_id` CHAR(36) NULL,
    `action` VARCHAR(120) NOT NULL,
    `entity_type` VARCHAR(80) NOT NULL,
    `entity_id` VARCHAR(80) NULL,
    `success` BOOLEAN NOT NULL,
    `request_id` VARCHAR(80) NULL,
    `ip_hash` BINARY(32) NULL,
    `user_agent` VARCHAR(500) NULL,
    `metadata_json` LONGTEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_audit_action_date`(`action`, `created_at`),
    INDEX `idx_audit_actor_date`(`actor_user_id`, `created_at`),
    INDEX `idx_audit_entity_date`(`entity_type`, `entity_id`, `created_at`),
    INDEX `idx_audit_request`(`request_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `login_attempts` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` CHAR(36) NULL,
    `login_identifier_hash` BINARY(32) NOT NULL,
    `ip_hash` BINARY(32) NULL,
    `user_agent` VARCHAR(500) NULL,
    `success` BOOLEAN NOT NULL,
    `failure_reason` VARCHAR(150) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_login_attempts_user_date`(`user_id`, `created_at`),
    INDEX `idx_login_identifier_date`(`login_identifier_hash`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `permissions` (
    `id` CHAR(36) NOT NULL,
    `code` VARCHAR(120) NOT NULL,
    `description` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `uq_permissions_code`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `report_access_credentials` (
    `id` CHAR(36) NOT NULL,
    `report_id` CHAR(36) NOT NULL,
    `secret_hash` VARCHAR(255) NOT NULL,
    `failed_attempts` INTEGER NOT NULL DEFAULT 0,
    `locked_until` DATETIME(3) NULL,
    `last_access_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `uq_access_credentials_report`(`report_id`),
    INDEX `idx_access_credentials_locked`(`locked_until`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `report_access_grants` (
    `id` CHAR(36) NOT NULL,
    `report_id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `scope` ENUM('VIEW', 'MESSAGE', 'INVESTIGATE', 'MANAGE') NOT NULL,
    `granted_by_user_id` CHAR(36) NOT NULL,
    `revoked_by_user_id` CHAR(36) NULL,
    `reason_ciphertext` LONGBLOB NULL,
    `reason_iv` BINARY(12) NULL,
    `reason_auth_tag` BINARY(16) NULL,
    `reason_key_version` INTEGER NULL,
    `expires_at` DATETIME(3) NULL,
    `revoked_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `fk_access_grants_creator`(`granted_by_user_id`),
    INDEX `fk_access_grants_revoker`(`revoked_by_user_id`),
    INDEX `idx_access_grants_report_active`(`report_id`, `revoked_at`),
    INDEX `idx_access_grants_user_active`(`user_id`, `revoked_at`, `expires_at`),
    UNIQUE INDEX `uq_access_grants_report_user_scope`(`report_id`, `user_id`, `scope`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `report_assignments` (
    `id` CHAR(36) NOT NULL,
    `report_id` CHAR(36) NOT NULL,
    `assigned_user_id` CHAR(36) NULL,
    `assigned_team_id` CHAR(36) NULL,
    `assigned_by_type` ENUM('ADMIN', 'SYSTEM') NOT NULL DEFAULT 'ADMIN',
    `assigned_by_user_id` CHAR(36) NULL,
    `type` ENUM('PRIMARY', 'SUPPORTING', 'TEAM') NOT NULL DEFAULT 'PRIMARY',
    `reason_ciphertext` LONGBLOB NULL,
    `reason_iv` BINARY(12) NULL,
    `reason_auth_tag` BINARY(16) NULL,
    `reason_key_version` INTEGER NULL,
    `started_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `ended_at` DATETIME(3) NULL,

    INDEX `fk_assignments_creator`(`assigned_by_user_id`),
    INDEX `idx_assignments_report_date`(`report_id`, `started_at`),
    INDEX `idx_assignments_team_end`(`assigned_team_id`, `ended_at`),
    INDEX `idx_assignments_user_end`(`assigned_user_id`, `ended_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `report_attachments` (
    `id` CHAR(36) NOT NULL,
    `report_id` CHAR(36) NOT NULL,
    `message_id` CHAR(36) NULL,
    `internal_note_id` CHAR(36) NULL,
    `uploaded_by_type` ENUM('REPORTER', 'ADMIN', 'SYSTEM') NOT NULL,
    `uploaded_by_user_id` CHAR(36) NULL,
    `visibility` ENUM('REPORTER_AND_ADMIN', 'ADMIN_ONLY') NOT NULL DEFAULT 'REPORTER_AND_ADMIN',
    `storage_key` VARCHAR(500) NOT NULL,
    `mime_type` VARCHAR(150) NOT NULL,
    `size_bytes` BIGINT UNSIGNED NOT NULL,
    `sha256` CHAR(64) NOT NULL,
    `original_name_ciphertext` LONGBLOB NOT NULL,
    `original_name_iv` BINARY(12) NOT NULL,
    `original_name_auth_tag` BINARY(16) NOT NULL,
    `original_name_key_version` INTEGER NOT NULL,
    `file_iv` BINARY(12) NULL,
    `file_auth_tag` BINARY(16) NULL,
    `file_encryption_key_version` INTEGER NULL,
    `scan_status` ENUM('PENDING', 'SCANNING', 'CLEAN', 'INFECTED', 'FAILED', 'QUARANTINED') NOT NULL DEFAULT 'PENDING',
    `scan_started_at` DATETIME(3) NULL,
    `scan_completed_at` DATETIME(3) NULL,
    `scan_attempts` INTEGER NOT NULL DEFAULT 0,
    `available_at` DATETIME(3) NULL,
    `quarantined_at` DATETIME(3) NULL,
    `purged_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `uq_attachments_storage_key`(`storage_key`),
    INDEX `idx_attachments_message`(`message_id`),
    INDEX `idx_attachments_note`(`internal_note_id`),
    INDEX `idx_attachments_report_date`(`report_id`, `created_at`),
    INDEX `idx_attachments_scan_date`(`scan_status`, `created_at`),
    INDEX `idx_attachments_sha256`(`sha256`),
    INDEX `idx_attachments_uploader_date`(`uploaded_by_user_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `report_categories` (
    `id` CHAR(36) NOT NULL,
    `code` VARCHAR(80) NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `description` VARCHAR(500) NULL,
    `default_priority` ENUM('LOW', 'NORMAL', 'HIGH', 'CRITICAL') NOT NULL DEFAULT 'NORMAL',
    `default_team_id` CHAR(36) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `uq_report_categories_code`(`code`),
    INDEX `idx_categories_active`(`is_active`),
    INDEX `idx_categories_team`(`default_team_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `report_events` (
    `id` CHAR(36) NOT NULL,
    `report_id` CHAR(36) NOT NULL,
    `event_type` ENUM('REPORT_CREATED', 'STATUS_CHANGED', 'PRIORITY_CHANGED', 'ASSIGNED', 'UNASSIGNED', 'ACCESS_GRANTED', 'ACCESS_REVOKED', 'USER_RESTRICTED', 'USER_RESTRICTION_REVOKED', 'MESSAGE_SENT', 'INFORMATION_REQUESTED', 'INFORMATION_RECEIVED', 'INTERNAL_NOTE_ADDED', 'ATTACHMENT_ADDED', 'REPORT_CONCLUDED', 'REPORT_ARCHIVED', 'LEGAL_HOLD_APPLIED', 'LEGAL_HOLD_REMOVED', 'RETENTION_SCHEDULED', 'RETENTION_EXECUTED') NOT NULL,
    `actor_type` ENUM('REPORTER', 'ADMIN', 'SYSTEM') NOT NULL,
    `actor_user_id` CHAR(36) NULL,
    `previous_status` ENUM('RECEIVED', 'INITIAL_REVIEW', 'WAITING_REPORTER_INFORMATION', 'INVESTIGATING', 'FORWARDED', 'CONCLUDED', 'ARCHIVED') NULL,
    `new_status` ENUM('RECEIVED', 'INITIAL_REVIEW', 'WAITING_REPORTER_INFORMATION', 'INVESTIGATING', 'FORWARDED', 'CONCLUDED', 'ARCHIVED') NULL,
    `public_message_ciphertext` LONGBLOB NULL,
    `public_message_iv` BINARY(12) NULL,
    `public_message_auth_tag` BINARY(16) NULL,
    `public_message_key_version` INTEGER NULL,
    `metadata_ciphertext` LONGBLOB NULL,
    `metadata_iv` BINARY(12) NULL,
    `metadata_auth_tag` BINARY(16) NULL,
    `metadata_key_version` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_events_actor_date`(`actor_user_id`, `created_at`),
    INDEX `idx_events_report_date`(`report_id`, `created_at`),
    INDEX `idx_events_type_date`(`event_type`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `report_identities` (
    `id` CHAR(36) NOT NULL,
    `report_id` CHAR(36) NOT NULL,
    `identity_ciphertext` LONGBLOB NOT NULL,
    `identity_iv` BINARY(12) NOT NULL,
    `identity_auth_tag` BINARY(16) NOT NULL,
    `encryption_key_version` INTEGER NOT NULL,
    `consent_to_contact` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `uq_report_identities_report`(`report_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `report_internal_notes` (
    `id` CHAR(36) NOT NULL,
    `report_id` CHAR(36) NOT NULL,
    `author_user_id` CHAR(36) NOT NULL,
    `body_ciphertext` LONGBLOB NOT NULL,
    `body_iv` BINARY(12) NOT NULL,
    `body_auth_tag` BINARY(16) NOT NULL,
    `encryption_key_version` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_internal_notes_author_date`(`author_user_id`, `created_at`),
    INDEX `idx_internal_notes_report_date`(`report_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `report_messages` (
    `id` CHAR(36) NOT NULL,
    `report_id` CHAR(36) NOT NULL,
    `sender_type` ENUM('REPORTER', 'ADMIN', 'SYSTEM') NOT NULL,
    `sender_user_id` CHAR(36) NULL,
    `type` ENUM('STANDARD', 'QUESTION', 'COMPLEMENT', 'FINAL_RESPONSE', 'SYSTEM_NOTICE') NOT NULL DEFAULT 'STANDARD',
    `body_ciphertext` LONGBLOB NOT NULL,
    `body_iv` BINARY(12) NOT NULL,
    `body_auth_tag` BINARY(16) NOT NULL,
    `encryption_key_version` INTEGER NOT NULL,
    `requires_response` BOOLEAN NOT NULL DEFAULT false,
    `reporter_read_at` DATETIME(3) NULL,
    `admin_read_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_messages_report_date`(`report_id`, `created_at`),
    INDEX `idx_messages_sender_date`(`sender_user_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `report_restricted_users` (
    `id` CHAR(36) NOT NULL,
    `report_id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `reason` ENUM('MENTIONED_IN_REPORT', 'CONFLICT_OF_INTEREST', 'HR_INVOLVEMENT', 'ADMIN_INVOLVEMENT', 'MANUAL') NOT NULL,
    `created_by_user_id` CHAR(36) NOT NULL,
    `revoked_by_user_id` CHAR(36) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `notes_ciphertext` LONGBLOB NULL,
    `notes_iv` BINARY(12) NULL,
    `notes_auth_tag` BINARY(16) NULL,
    `notes_key_version` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `revoked_at` DATETIME(3) NULL,

    INDEX `fk_restricted_creator`(`created_by_user_id`),
    INDEX `fk_restricted_revoker`(`revoked_by_user_id`),
    INDEX `idx_restricted_report_active`(`report_id`, `is_active`),
    INDEX `idx_restricted_user_active`(`user_id`, `is_active`),
    UNIQUE INDEX `uq_restricted_report_user`(`report_id`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `report_retention_executions` (
    `id` CHAR(36) NOT NULL,
    `report_id` CHAR(36) NULL,
    `policy_id` CHAR(36) NULL,
    `report_reference_hash` BINARY(32) NOT NULL,
    `action` ENUM('ANONYMIZE', 'DELETE') NOT NULL,
    `status` ENUM('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `scheduled_at` DATETIME(3) NOT NULL,
    `started_at` DATETIME(3) NULL,
    `completed_at` DATETIME(3) NULL,
    `executed_by_user_id` CHAR(36) NULL,
    `error_message` VARCHAR(1000) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `fk_retention_exec_user`(`executed_by_user_id`),
    INDEX `idx_retention_exec_policy`(`policy_id`),
    INDEX `idx_retention_exec_report`(`report_id`),
    INDEX `idx_retention_exec_status_date`(`status`, `scheduled_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `reporter_sessions` (
    `id` CHAR(36) NOT NULL,
    `report_id` CHAR(36) NOT NULL,
    `token_hash` BINARY(32) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `last_used_at` DATETIME(3) NULL,
    `revoked_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `uq_reporter_sessions_token`(`token_hash`),
    INDEX `idx_reporter_sessions_report_expiry`(`report_id`, `expires_at`),
    INDEX `idx_reporter_sessions_revoked_expiry`(`revoked_at`, `expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `reports` (
    `id` CHAR(36) NOT NULL,
    `protocol` VARCHAR(40) NOT NULL,
    `mode` ENUM('ANONYMOUS', 'IDENTIFIED') NOT NULL,
    `relationship_type` ENUM('EMPLOYEE', 'FORMER_EMPLOYEE', 'SUPPLIER', 'CUSTOMER', 'OTHER') NOT NULL,
    `unit_id` CHAR(36) NULL,
    `category_id` CHAR(36) NOT NULL,
    `immediate_risk` BOOLEAN NOT NULL DEFAULT false,
    `priority` ENUM('LOW', 'NORMAL', 'HIGH', 'CRITICAL') NOT NULL DEFAULT 'NORMAL',
    `status` ENUM('RECEIVED', 'INITIAL_REVIEW', 'WAITING_REPORTER_INFORMATION', 'INVESTIGATING', 'FORWARDED', 'CONCLUDED', 'ARCHIVED') NOT NULL DEFAULT 'RECEIVED',
    `content_ciphertext` LONGBLOB NOT NULL,
    `content_iv` BINARY(12) NOT NULL,
    `content_auth_tag` BINARY(16) NOT NULL,
    `encryption_key_version` INTEGER NOT NULL,
    `current_assignee_user_id` CHAR(36) NULL,
    `current_assignee_team_id` CHAR(36) NULL,
    `status_version` INTEGER NOT NULL DEFAULT 1,
    `last_activity_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `concluded_at` DATETIME(3) NULL,
    `archived_at` DATETIME(3) NULL,
    `retention_until` DATETIME(3) NULL,
    `legal_hold` BOOLEAN NOT NULL DEFAULT false,
    `legal_hold_reason_ciphertext` LONGBLOB NULL,
    `legal_hold_reason_iv` BINARY(12) NULL,
    `legal_hold_reason_auth_tag` BINARY(16) NULL,
    `legal_hold_key_version` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `uq_reports_protocol`(`protocol`),
    INDEX `idx_reports_category_status`(`category_id`, `status`),
    INDEX `idx_reports_last_activity`(`last_activity_at`),
    INDEX `idx_reports_priority_status`(`priority`, `status`),
    INDEX `idx_reports_retention_hold`(`retention_until`, `legal_hold`),
    INDEX `idx_reports_status_created`(`status`, `created_at`),
    INDEX `idx_reports_team_status`(`current_assignee_team_id`, `status`),
    INDEX `idx_reports_unit_status`(`unit_id`, `status`),
    INDEX `idx_reports_user_status`(`current_assignee_user_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `retention_policies` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `category_id` CHAR(36) NULL,
    `applies_to_status` ENUM('RECEIVED', 'INITIAL_REVIEW', 'WAITING_REPORTER_INFORMATION', 'INVESTIGATING', 'FORWARDED', 'CONCLUDED', 'ARCHIVED') NULL,
    `retention_days` INTEGER NOT NULL,
    `action` ENUM('ANONYMIZE', 'DELETE') NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_retention_active`(`is_active`),
    INDEX `idx_retention_category_status`(`category_id`, `applies_to_status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `role_permissions` (
    `role_id` CHAR(36) NOT NULL,
    `permission_id` CHAR(36) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_role_permissions_permission`(`permission_id`),
    PRIMARY KEY (`role_id`, `permission_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `roles` (
    `id` CHAR(36) NOT NULL,
    `code` VARCHAR(80) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `description` VARCHAR(500) NULL,
    `is_system` BOOLEAN NOT NULL DEFAULT false,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `uq_roles_code`(`code`),
    INDEX `idx_roles_active`(`is_active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `routing_rules` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `priority` INTEGER NOT NULL DEFAULT 100,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `stop_processing` BOOLEAN NOT NULL DEFAULT true,
    `category_id` CHAR(36) NULL,
    `unit_id` CHAR(36) NULL,
    `report_mode` ENUM('ANONYMOUS', 'IDENTIFIED') NULL,
    `relationship_type` ENUM('EMPLOYEE', 'FORMER_EMPLOYEE', 'SUPPLIER', 'CUSTOMER', 'OTHER') NULL,
    `immediate_risk` BOOLEAN NULL,
    `restricted_role_id` CHAR(36) NULL,
    `target_user_id` CHAR(36) NULL,
    `target_team_id` CHAR(36) NULL,
    `set_priority` ENUM('LOW', 'NORMAL', 'HIGH', 'CRITICAL') NULL,
    `created_by_user_id` CHAR(36) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `fk_routing_creator`(`created_by_user_id`),
    INDEX `fk_routing_target_team`(`target_team_id`),
    INDEX `fk_routing_target_user`(`target_user_id`),
    INDEX `idx_routing_active_priority`(`is_active`, `priority`),
    INDEX `idx_routing_category`(`category_id`),
    INDEX `idx_routing_restricted_role`(`restricted_role_id`),
    INDEX `idx_routing_unit`(`unit_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `system_settings` (
    `id` CHAR(36) NOT NULL,
    `key` VARCHAR(120) NOT NULL,
    `value` LONGTEXT NOT NULL,
    `description` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `uq_system_settings_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `team_members` (
    `team_id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `role` ENUM('COORDINATOR', 'MEMBER', 'OBSERVER') NOT NULL DEFAULT 'MEMBER',
    `joined_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_team_members_user`(`user_id`),
    PRIMARY KEY (`team_id`, `user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `teams` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `description` VARCHAR(500) NULL,
    `is_independent` BOOLEAN NOT NULL DEFAULT false,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `uq_teams_name`(`name`),
    INDEX `idx_teams_active`(`is_active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `units` (
    `id` CHAR(36) NOT NULL,
    `parent_id` CHAR(36) NULL,
    `code` VARCHAR(80) NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `type` ENUM('COMPANY', 'UNIT', 'DEPARTMENT', 'SECTOR', 'LOCATION') NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `uq_units_code`(`code`),
    INDEX `idx_units_parent`(`parent_id`),
    INDEX `idx_units_type_active`(`type`, `is_active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_mfa_methods` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `type` ENUM('TOTP') NOT NULL DEFAULT 'TOTP',
    `label` VARCHAR(100) NULL,
    `secret_ciphertext` LONGBLOB NOT NULL,
    `secret_iv` BINARY(12) NOT NULL,
    `secret_auth_tag` BINARY(16) NOT NULL,
    `encryption_key_version` INTEGER NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT false,
    `verified_at` DATETIME(3) NULL,
    `last_used_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_mfa_user_active`(`user_id`, `is_active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_one_time_tokens` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `type` ENUM('USER_INVITATION', 'PASSWORD_RESET', 'EMAIL_VERIFICATION') NOT NULL,
    `token_hash` BINARY(32) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `used_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `uq_one_time_token_hash`(`token_hash`),
    INDEX `idx_one_time_user_type_expiry`(`user_id`, `type`, `expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_recovery_codes` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `code_hash` VARCHAR(255) NOT NULL,
    `used_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_recovery_user_used`(`user_id`, `used_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_roles` (
    `user_id` CHAR(36) NOT NULL,
    `role_id` CHAR(36) NOT NULL,
    `assigned_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_user_roles_role`(`role_id`),
    PRIMARY KEY (`user_id`, `role_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_sessions` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `token_hash` BINARY(32) NOT NULL,
    `ip_hash` BINARY(32) NULL,
    `user_agent` VARCHAR(500) NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `last_used_at` DATETIME(3) NULL,
    `revoked_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `uq_user_sessions_token`(`token_hash`),
    INDEX `idx_user_sessions_revoked_expiry`(`revoked_at`, `expires_at`),
    INDEX `idx_user_sessions_user_expiry`(`user_id`, `expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `must_change_password` BOOLEAN NOT NULL DEFAULT true,
    `last_login_at` DATETIME(3) NULL,
    `password_changed_at` DATETIME(3) NULL,
    `disabled_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `uq_users_email`(`email`),
    INDEX `idx_users_active`(`is_active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `retention_object_purge_queue` (
    `id` CHAR(36) NOT NULL,
    `execution_id` CHAR(36) NOT NULL,
    `storage_key` VARCHAR(500) NOT NULL,
    `status` ENUM('PENDING', 'RUNNING', 'COMPLETED', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `last_error` VARCHAR(1000) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_retention_purge_execution`(`execution_id`),
    INDEX `idx_retention_purge_status`(`status`, `created_at`),
    UNIQUE INDEX `uq_retention_purge_execution_key`(`execution_id`, `storage_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `anonymized_report_statistics` (
    `id` CHAR(36) NOT NULL,
    `period_month` DATE NOT NULL,
    `category_id` CHAR(36) NOT NULL,
    `total_reports` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `anonymous_reports` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `identified_reports` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `immediate_risk_reports` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_anonymized_stats_period`(`period_month`),
    INDEX `idx_anonymized_stats_category`(`category_id`),
    UNIQUE INDEX `uq_anonymized_stats_month_category`(`period_month`, `category_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `audit_logs` ADD CONSTRAINT `fk_audit_actor_user` FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `login_attempts` ADD CONSTRAINT `fk_login_attempts_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `report_access_credentials` ADD CONSTRAINT `fk_access_credentials_report` FOREIGN KEY (`report_id`) REFERENCES `reports`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `report_access_grants` ADD CONSTRAINT `fk_access_grants_creator` FOREIGN KEY (`granted_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `report_access_grants` ADD CONSTRAINT `fk_access_grants_report` FOREIGN KEY (`report_id`) REFERENCES `reports`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `report_access_grants` ADD CONSTRAINT `fk_access_grants_revoker` FOREIGN KEY (`revoked_by_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `report_access_grants` ADD CONSTRAINT `fk_access_grants_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `report_assignments` ADD CONSTRAINT `fk_assignments_creator` FOREIGN KEY (`assigned_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `report_assignments` ADD CONSTRAINT `fk_assignments_report` FOREIGN KEY (`report_id`) REFERENCES `reports`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `report_assignments` ADD CONSTRAINT `fk_assignments_team` FOREIGN KEY (`assigned_team_id`) REFERENCES `teams`(`id`) ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `report_assignments` ADD CONSTRAINT `fk_assignments_user` FOREIGN KEY (`assigned_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `report_attachments` ADD CONSTRAINT `fk_attachments_message` FOREIGN KEY (`message_id`) REFERENCES `report_messages`(`id`) ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `report_attachments` ADD CONSTRAINT `fk_attachments_note` FOREIGN KEY (`internal_note_id`) REFERENCES `report_internal_notes`(`id`) ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `report_attachments` ADD CONSTRAINT `fk_attachments_report` FOREIGN KEY (`report_id`) REFERENCES `reports`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `report_attachments` ADD CONSTRAINT `fk_attachments_uploader_user` FOREIGN KEY (`uploaded_by_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `report_categories` ADD CONSTRAINT `fk_categories_default_team` FOREIGN KEY (`default_team_id`) REFERENCES `teams`(`id`) ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `report_events` ADD CONSTRAINT `fk_events_actor_user` FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `report_events` ADD CONSTRAINT `fk_events_report` FOREIGN KEY (`report_id`) REFERENCES `reports`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `report_identities` ADD CONSTRAINT `fk_report_identities_report` FOREIGN KEY (`report_id`) REFERENCES `reports`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `report_internal_notes` ADD CONSTRAINT `fk_internal_notes_author` FOREIGN KEY (`author_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `report_internal_notes` ADD CONSTRAINT `fk_internal_notes_report` FOREIGN KEY (`report_id`) REFERENCES `reports`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `report_messages` ADD CONSTRAINT `fk_messages_report` FOREIGN KEY (`report_id`) REFERENCES `reports`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `report_messages` ADD CONSTRAINT `fk_messages_sender_user` FOREIGN KEY (`sender_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `report_restricted_users` ADD CONSTRAINT `fk_restricted_creator` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `report_restricted_users` ADD CONSTRAINT `fk_restricted_report` FOREIGN KEY (`report_id`) REFERENCES `reports`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `report_restricted_users` ADD CONSTRAINT `fk_restricted_revoker` FOREIGN KEY (`revoked_by_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `report_restricted_users` ADD CONSTRAINT `fk_restricted_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `report_retention_executions` ADD CONSTRAINT `fk_retention_exec_policy` FOREIGN KEY (`policy_id`) REFERENCES `retention_policies`(`id`) ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `report_retention_executions` ADD CONSTRAINT `fk_retention_exec_report` FOREIGN KEY (`report_id`) REFERENCES `reports`(`id`) ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `report_retention_executions` ADD CONSTRAINT `fk_retention_exec_user` FOREIGN KEY (`executed_by_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `reporter_sessions` ADD CONSTRAINT `fk_reporter_sessions_report` FOREIGN KEY (`report_id`) REFERENCES `reports`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `reports` ADD CONSTRAINT `fk_reports_assignee_team` FOREIGN KEY (`current_assignee_team_id`) REFERENCES `teams`(`id`) ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `reports` ADD CONSTRAINT `fk_reports_assignee_user` FOREIGN KEY (`current_assignee_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `reports` ADD CONSTRAINT `fk_reports_category` FOREIGN KEY (`category_id`) REFERENCES `report_categories`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `reports` ADD CONSTRAINT `fk_reports_unit` FOREIGN KEY (`unit_id`) REFERENCES `units`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `retention_policies` ADD CONSTRAINT `fk_retention_category` FOREIGN KEY (`category_id`) REFERENCES `report_categories`(`id`) ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `role_permissions` ADD CONSTRAINT `fk_role_permissions_permission` FOREIGN KEY (`permission_id`) REFERENCES `permissions`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `role_permissions` ADD CONSTRAINT `fk_role_permissions_role` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `routing_rules` ADD CONSTRAINT `fk_routing_category` FOREIGN KEY (`category_id`) REFERENCES `report_categories`(`id`) ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `routing_rules` ADD CONSTRAINT `fk_routing_creator` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `routing_rules` ADD CONSTRAINT `fk_routing_restricted_role` FOREIGN KEY (`restricted_role_id`) REFERENCES `roles`(`id`) ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `routing_rules` ADD CONSTRAINT `fk_routing_target_team` FOREIGN KEY (`target_team_id`) REFERENCES `teams`(`id`) ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `routing_rules` ADD CONSTRAINT `fk_routing_target_user` FOREIGN KEY (`target_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `routing_rules` ADD CONSTRAINT `fk_routing_unit` FOREIGN KEY (`unit_id`) REFERENCES `units`(`id`) ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `team_members` ADD CONSTRAINT `fk_team_members_team` FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `team_members` ADD CONSTRAINT `fk_team_members_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `units` ADD CONSTRAINT `fk_units_parent` FOREIGN KEY (`parent_id`) REFERENCES `units`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `user_mfa_methods` ADD CONSTRAINT `fk_mfa_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `user_one_time_tokens` ADD CONSTRAINT `fk_one_time_tokens_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `user_recovery_codes` ADD CONSTRAINT `fk_recovery_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `user_roles` ADD CONSTRAINT `fk_user_roles_role` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `user_roles` ADD CONSTRAINT `fk_user_roles_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `user_sessions` ADD CONSTRAINT `fk_user_sessions_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `retention_object_purge_queue` ADD CONSTRAINT `fk_retention_purge_execution` FOREIGN KEY (`execution_id`) REFERENCES `report_retention_executions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `anonymized_report_statistics` ADD CONSTRAINT `fk_anonymized_stats_category` FOREIGN KEY (`category_id`) REFERENCES `report_categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

SET @NVK_OLD_SQL_MODE = @@SESSION.sql_mode;
SET SESSION sql_mode = 'NO_AUTO_VALUE_ON_ZERO';

-- Trigger: trg_audit_logs_block_delete | audit_logs | BEFORE DELETE | ACTION_ORDER=1
CREATE TRIGGER `trg_audit_logs_block_delete` BEFORE DELETE ON `audit_logs` FOR EACH ROW BEGIN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Registros de auditoria não podem ser apagados.';
END;

-- Trigger: trg_audit_logs_validate_actor_before_insert | audit_logs | BEFORE INSERT | ACTION_ORDER=1
CREATE TRIGGER `trg_audit_logs_validate_actor_before_insert` BEFORE INSERT ON `audit_logs` FOR EACH ROW BEGIN
    IF NEW.`actor_type` = 'ADMIN' AND NEW.`actor_user_id` IS NULL THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Registros de auditoria de administrador exigem actor_user_id.';
    END IF;
END;

-- Trigger: trg_audit_logs_block_update | audit_logs | BEFORE UPDATE | ACTION_ORDER=1
CREATE TRIGGER `trg_audit_logs_block_update` BEFORE UPDATE ON `audit_logs` FOR EACH ROW BEGIN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Registros de auditoria não podem ser alterados.';
END;

-- Trigger: trg_report_assignments_validate_before_insert | report_assignments | BEFORE INSERT | ACTION_ORDER=1
CREATE TRIGGER `trg_report_assignments_validate_before_insert` BEFORE INSERT ON `report_assignments` FOR EACH ROW BEGIN
    IF NOT (
        (NEW.`assigned_user_id` IS NOT NULL AND NEW.`assigned_team_id` IS NULL)
        OR
        (NEW.`assigned_user_id` IS NULL AND NEW.`assigned_team_id` IS NOT NULL)
    ) THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'A atribuição deve apontar para exatamente um usuário ou uma equipe.';
    END IF;
END;

-- Trigger: trg_report_assignments_validate_before_update | report_assignments | BEFORE UPDATE | ACTION_ORDER=1
CREATE TRIGGER `trg_report_assignments_validate_before_update` BEFORE UPDATE ON `report_assignments` FOR EACH ROW BEGIN
    IF NOT (
        (NEW.`assigned_user_id` IS NOT NULL AND NEW.`assigned_team_id` IS NULL)
        OR
        (NEW.`assigned_user_id` IS NULL AND NEW.`assigned_team_id` IS NOT NULL)
    ) THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'A atribuição deve apontar para exatamente um usuário ou uma equipe.';
    END IF;
END;

-- Trigger: trg_report_attachments_validate_before_insert | report_attachments | BEFORE INSERT | ACTION_ORDER=1
CREATE TRIGGER `trg_report_attachments_validate_before_insert` BEFORE INSERT ON `report_attachments` FOR EACH ROW BEGIN
    IF NEW.`message_id` IS NOT NULL AND NEW.`internal_note_id` IS NOT NULL THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'O anexo pode pertencer a uma mensagem ou a uma nota interna, não às duas.';
    END IF;

    IF NEW.`uploaded_by_type` = 'ADMIN' AND NEW.`uploaded_by_user_id` IS NULL THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Anexos enviados por administrador exigem uploaded_by_user_id.';
    END IF;
END;

-- Trigger: trg_report_attachments_validate_before_update | report_attachments | BEFORE UPDATE | ACTION_ORDER=1
CREATE TRIGGER `trg_report_attachments_validate_before_update` BEFORE UPDATE ON `report_attachments` FOR EACH ROW BEGIN
    IF NEW.`message_id` IS NOT NULL AND NEW.`internal_note_id` IS NOT NULL THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'O anexo pode pertencer a uma mensagem ou a uma nota interna, não às duas.';
    END IF;

    IF NEW.`uploaded_by_type` = 'ADMIN' AND NEW.`uploaded_by_user_id` IS NULL THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Anexos enviados por administrador exigem uploaded_by_user_id.';
    END IF;
END;

-- Trigger: trg_report_events_block_delete | report_events | BEFORE DELETE | ACTION_ORDER=1
CREATE TRIGGER `trg_report_events_block_delete` BEFORE DELETE ON `report_events` FOR EACH ROW BEGIN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Eventos do histórico não podem ser apagados.';
END;

-- Trigger: trg_report_events_validate_actor_before_insert | report_events | BEFORE INSERT | ACTION_ORDER=1
CREATE TRIGGER `trg_report_events_validate_actor_before_insert` BEFORE INSERT ON `report_events` FOR EACH ROW BEGIN
    IF NEW.`actor_type` = 'ADMIN' AND NEW.`actor_user_id` IS NULL THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Eventos de administrador exigem actor_user_id.';
    END IF;
END;

-- Trigger: trg_report_events_block_update | report_events | BEFORE UPDATE | ACTION_ORDER=1
CREATE TRIGGER `trg_report_events_block_update` BEFORE UPDATE ON `report_events` FOR EACH ROW BEGIN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Eventos do histórico não podem ser alterados.';
END;

-- Trigger: trg_report_internal_notes_block_delete | report_internal_notes | BEFORE DELETE | ACTION_ORDER=1
CREATE TRIGGER `trg_report_internal_notes_block_delete` BEFORE DELETE ON `report_internal_notes` FOR EACH ROW BEGIN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Anotações internas não podem ser apagadas.';
END;

-- Trigger: trg_report_internal_notes_block_update | report_internal_notes | BEFORE UPDATE | ACTION_ORDER=1
CREATE TRIGGER `trg_report_internal_notes_block_update` BEFORE UPDATE ON `report_internal_notes` FOR EACH ROW BEGIN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Anotações internas não podem ser alteradas.';
END;

-- Trigger: trg_report_messages_block_delete | report_messages | BEFORE DELETE | ACTION_ORDER=1
CREATE TRIGGER `trg_report_messages_block_delete` BEFORE DELETE ON `report_messages` FOR EACH ROW BEGIN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Mensagens não podem ser apagadas.';
END;

-- Trigger: trg_report_messages_validate_sender_before_insert | report_messages | BEFORE INSERT | ACTION_ORDER=1
CREATE TRIGGER `trg_report_messages_validate_sender_before_insert` BEFORE INSERT ON `report_messages` FOR EACH ROW BEGIN
    IF NEW.`sender_type` = 'ADMIN' AND NEW.`sender_user_id` IS NULL THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Mensagens de administrador exigem sender_user_id.';
    END IF;
END;

-- Trigger: trg_report_messages_protect_before_update | report_messages | BEFORE UPDATE | ACTION_ORDER=1
CREATE TRIGGER `trg_report_messages_protect_before_update` BEFORE UPDATE ON `report_messages` FOR EACH ROW BEGIN
    IF NOT (
        OLD.`id` <=> NEW.`id`
        AND OLD.`report_id` <=> NEW.`report_id`
        AND OLD.`sender_type` <=> NEW.`sender_type`
        AND OLD.`sender_user_id` <=> NEW.`sender_user_id`
        AND OLD.`type` <=> NEW.`type`
        AND OLD.`body_ciphertext` <=> NEW.`body_ciphertext`
        AND OLD.`body_iv` <=> NEW.`body_iv`
        AND OLD.`body_auth_tag` <=> NEW.`body_auth_tag`
        AND OLD.`encryption_key_version` <=> NEW.`encryption_key_version`
        AND OLD.`requires_response` <=> NEW.`requires_response`
        AND OLD.`created_at` <=> NEW.`created_at`
    ) THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Mensagens não podem ser alteradas depois do envio.';
    END IF;
END;

-- Trigger: trg_reports_validate_assignee_before_insert | reports | BEFORE INSERT | ACTION_ORDER=1
CREATE TRIGGER `trg_reports_validate_assignee_before_insert` BEFORE INSERT ON `reports` FOR EACH ROW BEGIN
    IF NEW.`current_assignee_user_id` IS NOT NULL
       AND NEW.`current_assignee_team_id` IS NOT NULL THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'A denúncia deve ter no máximo um responsável atual: usuário ou equipe.';
    END IF;
END;

-- Trigger: trg_reports_validate_assignee_before_update | reports | BEFORE UPDATE | ACTION_ORDER=1
CREATE TRIGGER `trg_reports_validate_assignee_before_update` BEFORE UPDATE ON `reports` FOR EACH ROW BEGIN
    IF NEW.`current_assignee_user_id` IS NOT NULL
       AND NEW.`current_assignee_team_id` IS NOT NULL THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'A denúncia deve ter no máximo um responsável atual: usuário ou equipe.';
    END IF;
END;

-- Trigger: trg_reports_protect_original_before_update | reports | BEFORE UPDATE | ACTION_ORDER=2
CREATE TRIGGER `trg_reports_protect_original_before_update` BEFORE UPDATE ON `reports` FOR EACH ROW BEGIN
    IF NOT (
        OLD.`protocol` <=> NEW.`protocol`
        AND OLD.`mode` <=> NEW.`mode`
        AND OLD.`relationship_type` <=> NEW.`relationship_type`
        AND OLD.`unit_id` <=> NEW.`unit_id`
        AND OLD.`category_id` <=> NEW.`category_id`
        AND OLD.`immediate_risk` <=> NEW.`immediate_risk`
        AND OLD.`content_ciphertext` <=> NEW.`content_ciphertext`
        AND OLD.`content_iv` <=> NEW.`content_iv`
        AND OLD.`content_auth_tag` <=> NEW.`content_auth_tag`
        AND OLD.`encryption_key_version` <=> NEW.`encryption_key_version`
    ) THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'O conteúdo original da denúncia não pode ser alterado.';
    END IF;
END;

-- Trigger: trg_routing_rules_validate_before_insert | routing_rules | BEFORE INSERT | ACTION_ORDER=1
CREATE TRIGGER `trg_routing_rules_validate_before_insert` BEFORE INSERT ON `routing_rules` FOR EACH ROW BEGIN
    IF NEW.`target_user_id` IS NOT NULL AND NEW.`target_team_id` IS NOT NULL THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'A regra de roteamento deve ter no máximo um destino: usuário ou equipe.';
    END IF;

    IF NEW.`target_user_id` IS NULL
       AND NEW.`target_team_id` IS NULL
       AND NEW.`set_priority` IS NULL THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'A regra de roteamento precisa definir um destino ou uma prioridade.';
    END IF;
END;

-- Trigger: trg_routing_rules_validate_before_update | routing_rules | BEFORE UPDATE | ACTION_ORDER=1
CREATE TRIGGER `trg_routing_rules_validate_before_update` BEFORE UPDATE ON `routing_rules` FOR EACH ROW BEGIN
    IF NEW.`target_user_id` IS NOT NULL AND NEW.`target_team_id` IS NOT NULL THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'A regra de roteamento deve ter no máximo um destino: usuário ou equipe.';
    END IF;

    IF NEW.`target_user_id` IS NULL
       AND NEW.`target_team_id` IS NULL
       AND NEW.`set_priority` IS NULL THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'A regra de roteamento precisa definir um destino ou uma prioridade.';
    END IF;
END;

SET SESSION sql_mode = @NVK_OLD_SQL_MODE;