import { Pool, PoolConfig } from 'pg';
import { config } from '../config/env';

/**
 * Configuración del Pool de PostgreSQL (hospital_db)
 * Compatible con entornos locales y proveedores en la nube (Neon, Supabase, Railway, Render).
 */
const poolConfig: PoolConfig = {
  connectionString: config.databaseUrl,
  max: parseInt(process.env.DB_POOL_MAX || '20', 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
};

// Activar SSL automáticamente para bases de datos en la nube
if (config.dbSsl) {
  poolConfig.ssl = {
    rejectUnauthorized: false
  };
}

export const pool = new Pool(poolConfig);

// Capturar errores del pool para evitar que una desconexión temporal de red detenga el servidor
pool.on('error', (err) => {
  console.error('[DATABASE POOL ERROR] Error en conexión en segundo plano con PostgreSQL:', err.message);
});

export const query = (text: string, params?: any[]) => {
  return pool.query(text, params);
};

export async function testDbConnection(): Promise<boolean> {
  try {
    const res = await pool.query('SELECT current_database(), current_user, version()');
    const row = res.rows[0];
    console.log(`[DATABASE CONNECTED] Base de datos: ${row.current_database} | Usuario: ${row.current_user}`);
    console.log(`[DATABASE SSL] Estado de cifrado SSL: ${config.dbSsl ? 'ACTIVADO (Nube: Neon/Supabase/Render)' : 'DESACTIVADO (Local)'}`);
    return true;
  } catch (error: any) {
    console.warn(`[DATABASE WARNING] No se pudo conectar a PostgreSQL (${error.message}).`);
    return false;
  }
}
