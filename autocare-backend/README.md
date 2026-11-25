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
Open TiDB Cloud, SQL Editor, select `vehiclecare`. Run these two files, in this order:
1. `sql/01-schema-additions.sql` adds columns to the existing tables.
2. `sql/02-password-reset.sql` creates the `password_resets` table (for "Forgot password").

Click inside the editor and press **Ctrl+A** before **Run**, otherwise only one statement runs.
A "Duplicate column / key" message means that part was already applied, so skip it.

## 3. Check the connection
```bash
npm run check-db     # connects, lists tables, shows anything missing and how email is set up
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

## Forgot password (6-digit code by email)
The user taps **Forgot password?** on the login screen, enters their email, receives a 6-digit
code, then enters the code with a new password.

### How the email is sent
| Setup | Use it for | What to put in `.env` |
| --- | --- | --- |
| **Nothing** | Building and testing. The code is **printed in the terminal** where `npm start` runs. No email is sent. | leave the email lines empty |
| **Gmail** | Real emails while testing on your own PC | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` |
| **Brevo** | Real emails when deployed on **Render's free plan** | `BREVO_API_KEY`, `MAIL_FROM` |

Render's free plan blocks the SMTP ports (25, 465, 587) since September 2025, so Gmail SMTP works on
your PC but not on a free Render service. Brevo sends over HTTPS, which is not blocked.

After you change `.env`, test the email on its own (no need to open the app):
```bash
npm run test-email -- you@example.com
```

**Gmail (testing on your PC)**
1. Use a personal Gmail account. School or work accounts often have app passwords turned off.
2. Google Account, Security, turn on **2-Step Verification**.
3. Search "App passwords" in your Google Account, create one named AutoCARe, and copy the 16 characters.
4. In `.env`:
   ```
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=465
   SMTP_USER=yourname@gmail.com
   SMTP_PASS=abcdefghijklmnop
   MAIL_FROM=AutoCARe <yourname@gmail.com>
   ```

**Brevo (deployed on Render free)**
1. Create a free account at brevo.com (300 emails a day on the free plan). It may ask you to verify your account before it will send.
2. Add and verify a sender address (you get a link by email).
3. SMTP & API, API Keys, generate a key.
4. Set `BREVO_API_KEY` and `MAIL_FROM=AutoCARe <the verified address>`. Check the spam folder while testing, because mail sent for a Gmail address through Brevo can be treated as spam.

### Rules the API follows
- The code has 6 digits, works for 10 minutes and works once. Only a hash of it is stored.
- A wrong code can be tried 5 times, then that code stops working.
- One new code per minute and 5 per hour for each account. A new code cancels the earlier one.
- The answer never reveals whether an email address has an account, and all failures show the same message.
- After a password is reset, everyone logged in with the old password is signed out. Existing logins from before this update also stop working once, so log in again.
- The user gets an email saying the password was changed.

## Deploying (for example on Render)
Add these environment variables as well as the database ones:
- `NODE_ENV=production`: reset codes are never printed in the logs.
- `TRUST_PROXY=1`: the rate limits then see the real visitor instead of Render's proxy.
- `BREVO_API_KEY` and `MAIL_FROM` (see above).

## Troubleshooting
| Message | Fix |
| --- | --- |
| `ER_ACCESS_DENIED_ERROR` | Wrong user or password. The username needs the cluster prefix. |
| `ETIMEDOUT` / `ECONNREFUSED` | Check host and port 4000. In TiDB Cloud, allow your IP address. |
| `ER_BAD_FIELD_ERROR` | Step 2 was not run. |
| `ER_NO_SUCH_TABLE ... password_resets` | `sql/02-password-reset.sql` was not run. |
| CORS error in browser | `FRONTEND_URL` in `.env` must match the address of the frontend. |
| No code arrives | Run `npm run test-email -- you@example.com`. Read the messages in the `npm start` terminal and check the spam folder. |
| 429 Too many attempts | Wait a few minutes. The limits are per visitor address. |

## Endpoints (all under /api)
`POST /auth/login`, `POST /auth/register`, `POST /auth/forgot-password`, `POST /auth/reset-password`,
`PUT /me`, `GET|PUT /vehicle`, `GET /vehicle/health`,
`GET|POST /appointments`, `GET /service-records`, `GET /notifications`, `PATCH /notifications/:id/read`,
`GET /staff/dashboard` (staff roles only).

Login accepts the username or the email in the same box.

## Tests
`npm test` checks the maintenance rules, input validation, the password reset rules and the email sender.
It needs no database or network. The reset rules run against Node's built-in SQLite, so they need Node 22.5
or newer. On older Node those tests are skipped.
