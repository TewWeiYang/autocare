// Run with: npm run check-db
// Connects to your database, lists the tables, and checks that the columns the API needs exist.
import { pool } from '../src/db.js';
import { config } from '../src/config.js';

const REQUIRED = {
  users: ['user_id', 'full_name', 'email', 'password_hash', 'phone', 'role', 'is_active', 'username', 'loyalty_points'],
  vehicles: ['vehicle_id', 'owner_id', 'plate_number', 'make', 'model', 'year', 'current_mileage', 'next_service_due_mileage', 'next_service_due_date', 'ownership_type'],
  appointments: ['appointment_id', 'vehicle_id', 'customer_id', 'scheduled_datetime', 'service_type', 'customer_remarks', 'status'],
  service_records: ['record_id', 'vehicle_id', 'service_date', 'mileage_at_service', 'work_performed', 'is_archived', 'title', 'total_cost', 'parts_replaced_json'],
  part_conditions: ['condition_id', 'vehicle_id', 'part_name', 'condition_status', 'last_service_mileage', 'last_service_date'],
  maintenance_rules: ['rule_id', 'service_category', 'interval_km', 'interval_months', 'part_name', 'monitor_at', 'replace_at'],
  notifications: ['notification_id', 'user_id', 'vehicle_id', 'title', 'message', 'notification_type', 'is_read', 'created_at'],
};

function explain(err) {
  const code = err.code || '';
  if (code === 'ER_ACCESS_DENIED_ERROR') return 'The username or password was rejected. On TiDB Cloud the username includes a prefix, like "abc123.root". Copy it exactly from the Connect dialog.';
  if (code === 'ENOTFOUND') return 'The host name was not found. Check DB_HOST for typos, and check your internet connection.';
  if (code === 'ETIMEDOUT' || code === 'ECONNREFUSED') return 'Could not reach the database. Check DB_HOST and DB_PORT, your internet connection, and whether TiDB Cloud allows your IP address (cluster settings, "Security" or "Networking").';
  if (code === 'ER_BAD_DB_ERROR') return `The database "${config.db.database}" does not exist. Check DB_NAME.`;
  if (/ssl|tls|certificate/i.test(err.message)) return 'The secure connection failed. Keep DB_SSL=true for TiDB Cloud.';
  return '';
}

try {
  const [[info]] = await pool.query('SELECT VERSION() AS version, DATABASE() AS db');
  console.log(`Connected to ${config.db.host}:${config.db.port} as ${config.db.user}`);
  console.log(`Database: ${info.db}   Server: ${info.version}\n`);

  const [columns] = await pool.query(
    'SELECT table_name AS t, column_name AS c FROM information_schema.columns WHERE table_schema = ?',
    [config.db.database]
  );
  const have = {};
  for (const { t, c } of columns) (have[t.toLowerCase()] ||= new Set()).add(c.toLowerCase());

  let problems = 0;
  for (const [table, cols] of Object.entries(REQUIRED)) {
    if (!have[table]) { console.log(`MISSING TABLE  ${table}`); problems++; continue; }
    const [[{ n }]] = await pool.query(`SELECT COUNT(*) AS n FROM \`${table}\``);
    const missing = cols.filter((c) => !have[table].has(c));
    console.log(`${missing.length ? 'NEEDS FIX    ' : 'ok           '} ${table.padEnd(18)} ${String(n).padStart(5)} rows${missing.length ? '   missing: ' + missing.join(', ') : ''}`);
    problems += missing.length ? 1 : 0;
  }
  console.log(problems
    ? '\nSome tables or columns are missing. Run sql/01-schema-additions.sql in the TiDB SQL Editor (skip lines that say "Duplicate"), then run this check again.'
    : '\nAll good. You can run: npm run seed (demo data) and npm start.');
} catch (err) {
  console.error(`\nCould not connect: ${err.code || ''} ${err.message}`);
  const hint = explain(err);
  if (hint) console.error(`Hint: ${hint}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
