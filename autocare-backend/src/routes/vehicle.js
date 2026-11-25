import { Router } from 'express';
import { q } from '../db.js';
import { HttpError, duplicateOf } from '../errors.js';
import { requireAuth } from '../auth.js';
import * as v from '../validate.js';
import { vehicleToApi } from '../mappers.js';
import { vehicleOf } from '../queries.js';
import { loadEvaluatedParts } from '../health.js';
import { healthScore } from '../engine.js';

export const router = Router();

router.get('/vehicle', requireAuth, async (req, res) => {
  const vehicle = await vehicleOf(req.user.id);
  res.json(vehicle ? vehicleToApi(vehicle) : null);
});

// Creates the vehicle on first save, then updates it.
router.put('/vehicle', requireAuth, async (req, res) => {
  const b = req.body ?? {};
  const plate = v.plate(b.plateNumber);
  const { make, model } = v.brandAndModel(b.model);
  const year = v.intInRange(b.year, 1990, new Date().getFullYear() + 1, 'Enter a valid year.');
  const mileage = v.intInRange(b.mileage, 0, 2000000, 'Mileage must be a whole number of km.');
  const ownership = v.ownership(b.ownership);

  const current = await vehicleOf(req.user.id);
  if (current && mileage < current.current_mileage) {
    throw new HttpError(400, `Mileage cannot be lower than the current ${Number(current.current_mileage).toLocaleString('en-SG')} km.`);
  }
  try {
    if (current) {
      await q(
        'UPDATE vehicles SET plate_number = ?, make = ?, model = ?, year = ?, current_mileage = ?, ownership_type = ? WHERE vehicle_id = ? AND owner_id = ?',
        [plate, make, model, year, mileage, ownership, current.vehicle_id, req.user.id]
      );
    } else {
      await q(
        'INSERT INTO vehicles (owner_id, plate_number, make, model, year, current_mileage, ownership_type) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [req.user.id, plate, make, model, year, mileage, ownership]
      );
    }
  } catch (err) {
    if (duplicateOf(err)) throw new HttpError(409, 'That plate number is already registered.');
    throw err;
  }
  res.json(vehicleToApi(await vehicleOf(req.user.id)));
});

// Runs the maintenance rules for this vehicle, saves each part's status, and returns the score.
router.get('/vehicle/health', requireAuth, async (req, res) => {
  const vehicle = await vehicleOf(req.user.id);
  if (!vehicle) return res.json({ score: null });

  const parts = await loadEvaluatedParts({ vehicleId: vehicle.vehicle_id });
  await Promise.all(
    parts
      .filter(({ row, ev }) => row.condition_status !== ev.label)
      .map(({ row, ev }) => q('UPDATE part_conditions SET condition_status = ? WHERE condition_id = ?', [ev.label, row.condition_id]))
  );

  // Keep the next-service columns on the vehicle up to date, based on engine oil.
  const oil = parts.find(({ row }) => row.part_name === 'Engine oil');
  if (oil) {
    await q('UPDATE vehicles SET next_service_due_mileage = ?, next_service_due_date = ? WHERE vehicle_id = ?', [
      oil.ev.dueKm, oil.ev.dueDate, vehicle.vehicle_id,
    ]);
  }
  res.json({ score: healthScore(parts.map((p) => p.ev)) });
});
