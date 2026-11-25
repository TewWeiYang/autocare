import mysql from 'mysql2/promise';
import { config } from './config.js';

const { host, port, user, password, database, ssl } = config.db;

export const pool = mysql.createPool({
  host,
  port,
  user,
  password,
  database,
  // TiDB Cloud requires an encrypted connection.
  ssl: ssl ? { minVersion: 'TLSv1.2', rejectUnauthorized: true } : undefined,
  // Return DATE and DATETIME columns as text ('2026-11-25'), not JavaScript dates,
  // so JSON never shifts a date by a day.
  dateStrings: true,
  waitForConnections: true,
  connectionLimit: 10,
  enableKeepAlive: true,
});

// Runs a query with ? placeholders and returns the rows.
export const q = async (sql, params = []) => {
  const [rows] = await pool.query(sql, params);
  return rows;
};