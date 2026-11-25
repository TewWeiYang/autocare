import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePart, healthScore } from '../src/engine.js';
import * as v from '../src/validate.js';

const day = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const TODAY = day('2026-11-12');

test('oil with plenty of distance and time left is Good', () => {
  const r = evaluatePart({ lastMileage: 74200, lastDate: '2026-10-01', intervalKm: 10000, intervalMonths: 6, currentMileage: 78420 }, TODAY);
  assert.equal(r.level, 'good');
  assert.equal(r.dueKm, 84200);
  assert.equal(r.dueDate, '2027-04-01');
});

test('battery almost 3 years old is Replace Soon (time only)', () => {
  const r = evaluatePart({ lastMileage: 41000, lastDate: '2024-01-15', intervalKm: null, intervalMonths: 36, currentMileage: 78420 }, TODAY);
  assert.equal(r.level, 'bad');
  assert.equal(r.label, 'Replace Soon');
  assert.equal(r.dueDate, '2027-01-15');
  assert.equal(r.dueKm, null);
});

test('brake fluid with about 16% of its life left is Monitor', () => {
  const r = evaluatePart({ lastMileage: 55800, lastDate: '2025-03-10', intervalKm: null, intervalMonths: 24, currentMileage: 78420 }, TODAY);
  assert.equal(r.level, 'warn');
});

test('distance can make a part due even when time is fine', () => {
  const r = evaluatePart({ lastMileage: 60000, lastDate: '2026-10-01', intervalKm: 10000, intervalMonths: 12, currentMileage: 69500 }, TODAY);
  assert.equal(r.level, 'bad');
});

test('overdue parts are Replace Soon', () => {
  const r = evaluatePart({ lastMileage: 50000, lastDate: '2024-01-01', intervalKm: 10000, intervalMonths: 6, currentMileage: 90000 }, TODAY);
  assert.equal(r.level, 'bad');
  assert.ok(r.pct < 0);
});

test('no data means no judgement', () => {
  assert.equal(evaluatePart({ lastMileage: null, lastDate: null, intervalKm: 10000, intervalMonths: 6, currentMileage: 1000 }, TODAY), null);
});

test('health score is 100 when everything is fresh, and null with no parts', () => {
  const fresh = evaluatePart({ lastMileage: 78000, lastDate: '2026-11-01', intervalKm: 10000, intervalMonths: 6, currentMileage: 78420 }, TODAY);
  assert.equal(healthScore([fresh, fresh]), 100);
  assert.equal(healthScore([]), null);
});

test('health score drops when a part needs replacing', () => {
  const good = { pct: 0.9 };
  const bad = { pct: 0.05 };
  assert.equal(healthScore([good, bad]), 55);
});

test('validators accept good input and reject bad input', () => {
  assert.equal(v.email(' A@B.com '), 'a@b.com');
  assert.throws(() => v.email('nope'), /valid email/);
  assert.throws(() => v.password('short'), /8 to 72/);
  assert.equal(v.phone('+65 9123 4567'), '+65 9123 4567');
  assert.throws(() => v.phone('12'), /8 to 15 digits/);
  assert.deepEqual(v.brandAndModel('Toyota  Corolla Altis'), { make: 'Toyota', model: 'Corolla Altis' });
  assert.throws(() => v.brandAndModel('Toyota'), /brand and model/);
  assert.equal(v.slot('10:30'), '10:30');
  assert.throws(() => v.slot('10:00'), /available times/);
  assert.throws(() => v.isoDate('2026-13-40'), /valid date/);
  assert.equal(v.plate(' sja1234a '), 'SJA1234A');
  assert.equal(v.ownership('Nonsense'), 'Sole owner');
});
