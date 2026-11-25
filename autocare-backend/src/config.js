import 'dotenv/config';

const need = (key) => {
  const value = process.env[key];
  if (!value) {
    console.error(`Missing ${key}. Copy .env.example to .env and fill it in.`);
    process.exit(1);
  }
  return value;
};

export const config = {
  port: Number(process.env.PORT || 3000),
  frontendUrls: (process.env.FRONTEND_URL || 'http://localhost:5173').split(',').map((s) => s.trim()).filter(Boolean),
  isProduction: process.env.NODE_ENV === 'production',
  // Number of proxies in front of this server (Render has 1). Needed so rate limits see the real visitor.
  trustProxy: Number(process.env.TRUST_PROXY || 0),
  // Checked when first used, so scripts that only touch the database do not need it.
  get jwtSecret() {
    const value = process.env.JWT_SECRET;
    if (!value || value.length < 16 || value.startsWith('change-me')) {
      throw new Error('Set JWT_SECRET in .env to a long random string (see .env.example).');
    }
    return value;
  },
  db: {
    host: need('DB_HOST'),
    port: Number(process.env.DB_PORT || 4000),
    user: need('DB_USER'),
    password: need('DB_PASSWORD'),
    database: process.env.DB_NAME || 'vehiclecare',
    ssl: process.env.DB_SSL !== 'false',
  },
  // Sending email (password reset codes). All optional: with nothing set, codes are printed
  // in the terminal instead. See the README.
  mail: {
    from: process.env.MAIL_FROM || '',
    brevoKey: process.env.BREVO_API_KEY || '',
    smtp: {
      host: process.env.SMTP_HOST || '',
      port: Number(process.env.SMTP_PORT || 465),
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
    },
  },
};
