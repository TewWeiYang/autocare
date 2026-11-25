// Maintenance rules engine. Pure functions only (no database), so it is easy to test.
// A part is judged by how much of its life is left, by distance and by time, whichever is lower.
export const LEVEL_LABEL = { good: 'Good', warn: 'Monitor', bad: 'Replace Soon' };

const parseIso = (iso) => String(iso).slice(0, 10).split('-').map(Number);
const utc = (iso) => { const [y, m, d] = parseIso(iso); return Date.UTC(y, m - 1, d); };
const addMonths = (iso, n) => { const [y, m, d] = parseIso(iso); return Date.UTC(y, m - 1 + n, d); };
export const toIso = (ms) => new Date(ms).toISOString().slice(0, 10);
export const todayUtc = (now = new Date()) => Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());

/**
 * @returns null when there is not enough data to judge the part, otherwise
 * { pct, level: 'good'|'warn'|'bad', label, dueKm, dueDate }
 * pct is the share of the service interval still left (0.5 means half).
 */
export function evaluatePart(
  { lastMileage, lastDate, intervalKm, intervalMonths, monitorAt = 0.3, replaceAt = 0.1, currentMileage },
  today = todayUtc()
) {
  let pct = Infinity;
  let dueKm = null;
  let dueDate = null;

  if (intervalKm && lastMileage != null) {
    dueKm = lastMileage + intervalKm;
    pct = Math.min(pct, (dueKm - currentMileage) / intervalKm);
  }
  if (intervalMonths && lastDate) {
    const last = utc(lastDate);
    const due = addMonths(lastDate, intervalMonths);
    dueDate = toIso(due);
    pct = Math.min(pct, (due - today) / (due - last));
  }
  if (pct === Infinity) return null;

  const level = pct <= replaceAt ? 'bad' : pct <= monitorAt ? 'warn' : 'good';
  return { pct, level, label: LEVEL_LABEL[level], dueKm, dueDate };
}

// 0 to 100. A part with half its life left or more counts as full marks.
export function healthScore(evaluations) {
  if (!evaluations.length) return null;
  const total = evaluations.reduce((sum, e) => sum + Math.min(1, Math.max(0, e.pct) / 0.5), 0);
  return Math.round((total / evaluations.length) * 100);
}
