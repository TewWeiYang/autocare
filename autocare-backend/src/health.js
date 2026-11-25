import { q } from './db.js';
import { evaluatePart } from './engine.js';

// Loads tracked parts (joined to their maintenance rule) and judges each one.
// Pass a vehicleId for one vehicle, or nothing for all vehicles.
export async function loadEvaluatedParts({ vehicleId } = {}) {
  const rows = await q(
    `SELECT pc.condition_id, pc.vehicle_id, pc.part_name, pc.condition_status,
            pc.last_service_mileage, pc.last_service_date,
            r.interval_km, r.interval_months, r.monitor_at, r.replace_at,
            v.current_mileage, v.plate_number
       FROM part_conditions pc
       JOIN maintenance_rules r ON r.part_name = pc.part_name
       JOIN vehicles v ON v.vehicle_id = pc.vehicle_id
      ${vehicleId ? 'WHERE pc.vehicle_id = ?' : ''}
      LIMIT 2000`,
    vehicleId ? [vehicleId] : []
  );
  return rows
    .map((row) => ({
      row,
      ev: evaluatePart({
        lastMileage: row.last_service_mileage,
        lastDate: row.last_service_date,
        intervalKm: row.interval_km,
        intervalMonths: row.interval_months,
        monitorAt: Number(row.monitor_at),
        replaceAt: Number(row.replace_at),
        currentMileage: row.current_mileage,
      }),
    }))
    .filter((item) => item.ev);
}
