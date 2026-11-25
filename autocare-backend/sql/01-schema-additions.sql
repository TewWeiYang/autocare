-- Run this once in the TiDB SQL Editor, after your original CREATE TABLE script has run.
-- It adds the columns the API needs. Each ALTER does one change, because TiDB does not
-- accept every combination of changes in a single ALTER TABLE.
--
-- If a line fails with "Duplicate column name" or "Duplicate key name", that change is
-- already in place. Skip it and run the next line.

USE vehiclecare;

-- Users: username for login (the wireframe logs in with a username), and reward points
ALTER TABLE users ADD COLUMN username VARCHAR(50) NULL;
ALTER TABLE users ADD UNIQUE KEY uq_users_username (username);
ALTER TABLE users ADD COLUMN loyalty_points INT NOT NULL DEFAULT 0;

-- Vehicles: ownership shown on the vehicle screen
ALTER TABLE vehicles ADD COLUMN ownership_type VARCHAR(30) NOT NULL DEFAULT 'Sole owner';

-- Maintenance rules: one rule per part, and time-only parts (battery, brake fluid)
ALTER TABLE maintenance_rules ADD COLUMN part_name VARCHAR(100) NULL;
ALTER TABLE maintenance_rules MODIFY COLUMN interval_km INT NULL;
ALTER TABLE maintenance_rules MODIFY COLUMN interval_months INT NULL;
ALTER TABLE maintenance_rules ADD COLUMN monitor_at DECIMAL(3,2) NOT NULL DEFAULT 0.30;
ALTER TABLE maintenance_rules ADD COLUMN replace_at DECIMAL(3,2) NOT NULL DEFAULT 0.10;
ALTER TABLE maintenance_rules ADD UNIQUE KEY uq_rules_part (part_name);

-- Part conditions: when each part was last replaced, so the rules can work out its status
ALTER TABLE part_conditions ADD COLUMN last_service_mileage INT NULL;
ALTER TABLE part_conditions ADD COLUMN last_service_date DATE NULL;
ALTER TABLE part_conditions ADD UNIQUE KEY uq_vehicle_part (vehicle_id, part_name);

-- Service records: what the service booklet shows
ALTER TABLE service_records ADD COLUMN title VARCHAR(150) NULL;
ALTER TABLE service_records ADD COLUMN total_cost DECIMAL(10,2) NOT NULL DEFAULT 0.00;
ALTER TABLE service_records ADD COLUMN parts_replaced_json JSON NULL;

-- Notifications: new types (the existing values keep their order so TiDB accepts the change)
ALTER TABLE notifications MODIFY COLUMN notification_type
  ENUM('service_due','appointment_reminder','health_alert','general','quotation','promotion','loyalty') NOT NULL;

-- Indexes for the screens that look things up often
CREATE INDEX idx_appt_slot ON appointments (scheduled_datetime);
CREATE INDEX idx_appt_customer ON appointments (customer_id);
CREATE INDEX idx_notif_user ON notifications (user_id, is_read);
