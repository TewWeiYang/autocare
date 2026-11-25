-- Run this once in the TiDB SQL Editor, after 01-schema-additions.sql.
-- It creates the table that stores password reset codes for "Forgot password".
-- The code itself is never stored, only a hash of it.
--
-- Select the whole file (Ctrl+A) before you click Run, so every statement runs.

USE vehiclecare;

CREATE TABLE IF NOT EXISTS password_resets (
  reset_id   BIGINT   NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id    BIGINT   NOT NULL,
  otp_hash   CHAR(64) NOT NULL,
  attempts   TINYINT  NOT NULL DEFAULT 0,
  expires_at DATETIME NOT NULL,
  used_at    DATETIME NULL,
  created_at DATETIME NOT NULL,
  INDEX idx_pr_user (user_id, used_at, expires_at)
);
