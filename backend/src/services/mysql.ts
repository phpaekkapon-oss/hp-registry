import mysql from 'mysql2/promise';
import type { Pool, PoolOptions } from 'mysql2/promise';

/** Connection settings for the procurement database (see .env.example) */
export function dbConfig(withDatabase = true): PoolOptions {
  const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME } = process.env;
  if (!DB_HOST || !DB_USER || DB_PASSWORD === undefined) {
    throw new Error('[mysql] DB_HOST / DB_USER / DB_PASSWORD must be set in backend/.env');
  }
  return {
    host: DB_HOST,
    port: DB_PORT ? parseInt(DB_PORT, 10) : 3306,
    user: DB_USER,
    password: DB_PASSWORD,
    database: withDatabase ? DB_NAME || 'dw_hp_procure' : undefined,
    charset: 'utf8mb4',
    connectTimeout: 10_000,
    waitForConnections: true,
    connectionLimit: 10,
    // DATE columns come back as 'YYYY-MM-DD' strings: no timezone shifting between server and browser
    dateStrings: ['DATE'],
    decimalNumbers: true,
  };
}

/** Charset (see below) and Thailand time, so CURDATE()/NOW() match the office clock whatever the server's zone */
const SESSION_INIT = "SET NAMES utf8mb4, time_zone = '+07:00'";

let pool: Pool | null = null;

/**
 * The server at 192.168.1.241 forces character_set_client/connection/results to tis620 and ignores the
 * charset in the handshake, which silently mangles Thai text stored in utf8mb4 columns.
 * Every connection must therefore issue SET NAMES explicitly.
 */
export async function connect(withDatabase = true) {
  const conn = await mysql.createConnection(dbConfig(withDatabase));
  await conn.query(SESSION_INIT);
  return conn;
}

export function getPool(): Pool {
  if (!pool) {
    pool = mysql.createPool(dbConfig());
    pool.on('connection', (conn) => {
      conn.query(SESSION_INIT);
    });
  }
  return pool;
}

export { mysql };
