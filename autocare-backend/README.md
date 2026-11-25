# AutoCARe backend (Node.js + Express + TiDB)

API for the AutoCARe customer app and staff portal. It uses your TiDB Cloud database `vehiclecare`.

## 0. Security first
- If you ever pasted your TiDB password anywhere (chat, screenshots, GitHub), **reset it** in TiDB Cloud (Cluster, Settings, Reset root password) before you continue.
- Real credentials go only in `.env`. `.env` is in `.gitignore`, so it is never pushed to GitHub. Only `.env.example` (placeholders) is committed.

## 1. Set up
```bash
npm install
cp .env.example .env        # Windows PowerShell: copy .env.example .env
```
Open `.env` and fill in:
- `DB_HOST`, `DB_USER`, `DB_PASSWORD` from TiDB Cloud, "Connect" dialog. The user looks like `abc123.root`.
- `JWT_SECRET`: any long random text (16+ characters). Generate one with
  `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

## 2. Update the database
Open TiDB Cloud, SQL Editor, select `vehiclecare`, and run `sql/01-schema-additions.sql`.
Run it statement by statement. A "Duplicate column / key" message means it was already applied, so skip it.

## 3. Check the connection
```bash
npm run check-db     # connects, lists tables, shows anything missing
npm run seed         # optional demo data: demo / demo1234 and staff / staff1234
npm start            # http://localhost:3000/api
```
Test it: open http://localhost:3000/api/health. You should see `{"ok":true}`.

## 4. Connect the frontend
In the frontend folder create `.env` with:
```
VITE_API_URL=http://localhost:3000/api
```
Restart `npm run dev`. The app now uses the real database instead of sample data.

## Troubleshooting
| Message | Fix |
|---|---|
| `ER_ACCESS_DENIED_ERROR` | Wrong user or password. The username needs the cluster prefix. |
| `ETIMEDOUT` / `ECONNREFUSED` | Check host and port 4000. In TiDB Cloud, allow your IP address. |
| `ER_BAD_FIELD_ERROR` | Step 2 was not run. |
| CORS error in browser | `FRONTEND_URL` in `.env` must match the address of the frontend. |

## Endpoints (all under /api)
`POST /auth/login`, `POST /auth/register`, `PUT /me`, `GET|PUT /vehicle`, `GET /vehicle/health`,
`GET|POST /appointments`, `GET /service-records`, `GET /notifications`, `PATCH /notifications/:id/read`,
`GET /staff/dashboard` (staff roles only).

Login accepts the username or the email in the same box.

## Tests
`npm test` checks the maintenance rules engine and input validation (no database needed).
