// Run with: npm run seed
// Adds demo data for development: the six maintenance rules, a demo customer, a staff user,
// one vehicle with tracked parts, service history and two appointments.
// It skips anything that already exists, so running it twice is safe.
// The demo accounts use weak passwords. Delete them before real customers use the system.
import bcrypt from 'bcryptjs';
import { pool, q } from '../src/db.js';

const RULES = [
  ['Engine oil', 'Minor Service', 10000, 6, 'Engine oil and oil filter'],
  ['Front brake pads', 'Brake', 40000, 24, 'Front pad wear check'],
  ['Battery', 'Electrical', null, 36, '12V battery age'],
  ['Tyres', 'Tyres', 50000, 48, 'Tyre set age and distance'],
  ['Air filter', 'Minor Service', 20000, 12, 'Engine air filter'],
  ['Brake fluid', 'Brake Fluid', null, 24, 'Brake fluid flush'],
];
// part, last replaced at km, last replaced on
const PARTS = [
  ['Engine oil', 62100, '2026-06-20'],
  ['Front brake pads', 50800, '2025-09-01'],
  ['Battery', 41000, '2024-01-15'],
  ['Tyres', 50800, '2025-09-01'],
  ['Air filter', 62100, '2026-06-20'],
  ['Brake fluid', 55800, '2025-03-10'],
];
const RECORDS = [
  ['2025-09-01', 50800, 'Tyre Change', 'Replaced front brake pads and all four tyres, then aligned the wheels.', ['Tyres', 'Brake Pads'], 845],
  ['2025-12-18', 54300, 'General Service', 'Changed engine oil and oil filter.', ['Engine Oil', 'Oil Filter'], 112],
  ['2026-06-20', 62100, 'General Service', 'Changed engine oil, oil filter and air filter. 21-point inspection done.', ['Engine Oil', 'Oil Filter', 'Brake Pads'], 168.4],
];

const isoDay = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  if (d.getDay() === 0) d.setDate(d.getDate() + 1); // the workshop is closed on Sundays
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};

async function ensureUser({ username, fullName, email, phone, password, role }) {
  const [existing] = await q('SELECT user_id FROM users WHERE LOWER(email) = ?', [email]);
  if (existing) return existing.user_id;
  const hash = await bcrypt.hash(password, 10);
  const r = await q('INSERT INTO users (full_name, username, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?, ?)', [fullName, username, email, phone, hash, role]);
  console.log(`  added ${role} "${username}" (password ${password})`);
  return r.insertId;
}

try {
  console.log('Maintenance rules');
  for (const [part, category, km, months, description] of RULES) {
    const [found] = await q('SELECT rule_id FROM maintenance_rules WHERE part_name = ?', [part]);
    if (found) continue;
    await q('INSERT INTO maintenance_rules (part_name, service_category, interval_km, interval_months, description) VALUES (?, ?, ?, ?, ?)', [part, category, km, months, description]);
    console.log(`  added rule: ${part}`);
  }

  console.log('Users');
  const demoId = await ensureUser({ username: 'demo', fullName: 'Wei Yang', email: 'demo@autocare.example', phone: '91234567', password: 'demo1234', role: 'customer' });
  await ensureUser({ username: 'staff', fullName: 'David Lee', email: 'staff@autocare.example', phone: '93456789', password: 'staff1234', role: 'advisor' });

  console.log('Vehicle and history');
  let [vehicle] = await q('SELECT vehicle_id FROM vehicles WHERE owner_id = ? LIMIT 1', [demoId]);
  if (!vehicle) {
    const r = await q(
      'INSERT INTO vehicles (owner_id, plate_number, make, model, year, current_mileage, ownership_type) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [demoId, 'SJA1234A', 'Toyota', 'Corolla', 2020, 65000, 'Sole owner']
    );
    vehicle = { vehicle_id: r.insertId };
    console.log('  added vehicle SJA1234A');
  }
  const vid = vehicle.vehicle_id;

  for (const [part, km, date] of PARTS) {
    const [found] = await q('SELECT condition_id FROM part_conditions WHERE vehicle_id = ? AND part_name = ?', [vid, part]);
    if (!found) await q('INSERT INTO part_conditions (vehicle_id, part_name, last_service_mileage, last_service_date) VALUES (?, ?, ?, ?)', [vid, part, km, date]);
  }

  const [{ n: recordCount }] = await q('SELECT COUNT(*) AS n FROM service_records WHERE vehicle_id = ?', [vid]);
  if (!recordCount) {
    for (const [date, km, title, work, parts, cost] of RECORDS) {
      await q(
        'INSERT INTO service_records (vehicle_id, service_date, mileage_at_service, work_performed, title, total_cost, parts_replaced_json) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [vid, date, km, work, title, cost, JSON.stringify(parts)]
      );
    }
    console.log(`  added ${RECORDS.length} service records`);
  }

  const [{ n: apptCount }] = await q('SELECT COUNT(*) AS n FROM appointments WHERE customer_id = ?', [demoId]);
  if (!apptCount) {
    const rows = [
      [isoDay(7), '10:30', 'General Service', 'approved', null],
      [isoDay(14), '14:00', 'Repair Service', 'pending', 'Check for faulty radio'],
    ];
    for (const [date, time, type, status, remarks] of rows) {
      await q('INSERT INTO appointments (vehicle_id, customer_id, scheduled_datetime, service_type, status, customer_remarks) VALUES (?, ?, ?, ?, ?, ?)', [vid, demoId, `${date} ${time}:00`, type, status, remarks]);
    }
    console.log(`  added ${rows.length} appointments`);
  }

  console.log('\nDone. Demo logins: demo / demo1234 (customer), staff / staff1234 (staff).');
} catch (err) {
  console.error(`\nSeed failed: ${err.code || ''} ${err.message}`);
  if (['ER_BAD_FIELD_ERROR', 'ER_NO_SUCH_TABLE'].includes(err.code)) {
    console.error('Run sql/01-schema-additions.sql first (see README), then try again. "npm run check-db" shows what is missing.');
  }
  process.exitCode = 1;
} finally {
  await pool.end();
}
