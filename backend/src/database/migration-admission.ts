import { pool } from './db';

async function runAdmissionMigration() {
  console.log('[MIGRATION] Ejecutando migración para el Módulo de Admisión en Supabase (hospital_db)...');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Nuevas columnas en tabla 'pacientes'
    await client.query(`
      ALTER TABLE pacientes 
        ADD COLUMN IF NOT EXISTS email VARCHAR(180),
        ADD COLUMN IF NOT EXISTS sexo_biologico VARCHAR(20),
        ADD COLUMN IF NOT EXISTS identidad_genero VARCHAR(50),
        ADD COLUMN IF NOT EXISTS contacto_emergencia_parentesco VARCHAR(50),
        ADD COLUMN IF NOT EXISTS medicamentos_actuales TEXT,
        ADD COLUMN IF NOT EXISTS antecedentes_quirurgicos TEXT,
        ADD COLUMN IF NOT EXISTS antecedentes_familiares TEXT,
        ADD COLUMN IF NOT EXISTS peso_kg NUMERIC(5,2),
        ADD COLUMN IF NOT EXISTS talla_cm NUMERIC(5,2),
        ADD COLUMN IF NOT EXISTS imc NUMERIC(4,1),
        ADD COLUMN IF NOT EXISTS estado_atencion VARCHAR(50) DEFAULT 'EN_ESPERA';
    `);
    console.log('✅ Columnas agregadas/verificadas en tabla pacientes.');

    // 2. Nuevas columnas en tabla 'citas'
    await client.query(`
      ALTER TABLE citas 
        ADD COLUMN IF NOT EXISTS estado_atencion VARCHAR(50) DEFAULT 'EN_ESPERA',
        ADD COLUMN IF NOT EXISTS presion_arterial VARCHAR(30),
        ADD COLUMN IF NOT EXISTS frecuencia_cardiaca INT,
        ADD COLUMN IF NOT EXISTS frecuencia_respiratoria INT,
        ADD COLUMN IF NOT EXISTS temperatura NUMERIC(4,1),
        ADD COLUMN IF NOT EXISTS saturacion_oxigeno NUMERIC(4,1),
        ADD COLUMN IF NOT EXISTS peso_kg NUMERIC(5,2),
        ADD COLUMN IF NOT EXISTS talla_cm NUMERIC(5,2),
        ADD COLUMN IF NOT EXISTS imc NUMERIC(4,1);
    `);
    console.log('✅ Columnas agregadas/verificadas en tabla citas.');

    await client.query('COMMIT');
    console.log('🎉 [MIGRATION COMPLETED] Esquema de Admisión listo y activo en Supabase.');
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('❌ Error en migración de admisión:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

runAdmissionMigration().catch(err => {
  console.error(err);
  process.exit(1);
});
