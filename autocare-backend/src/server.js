import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { q } from './db.js';
import { errorHandler } from './errors.js';
import { router as auth } from './routes/auth.js';
import { router as me } from './routes/me.js';
import { router as vehicle } from './routes/vehicle.js';
import { router as appointments } from './routes/appointments.js';
import { router as records } from './routes/records.js';
import { router as notifications } from './routes/notifications.js';
import { router as staff } from './routes/staff.js';

void config.jwtSecret; // stop at startup if the secret is missing or still the placeholder

const app = express();
app.disable('x-powered-by');
app.use(cors({ origin: config.frontendUrls }));
app.use(express.json({ limit: '100kb' }));

// Quick check that the server is up and can reach the database.
app.get('/api/health', async (req, res) => {
  await q('SELECT 1');
  res.json({ ok: true });
});

for (const router of [auth, me, vehicle, appointments, records, notifications, staff]) app.use('/api', router);

app.use('/api', (req, res) => res.status(404).json({ message: 'Not found.' }));
app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`AutoCARe API running at http://localhost:${config.port}/api`);
  console.log(`Allowing requests from: ${config.frontendUrls.join(', ')}`);
});
