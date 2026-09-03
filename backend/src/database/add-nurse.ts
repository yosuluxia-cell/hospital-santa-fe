import { pool } from './db';
import bcrypt from 'bcryptjs';

async function addNurse() {
  const hash = bcrypt.hashSync('ClinicaSegura2026!', 10);
  try {
    const res = await pool.query(
      `INSERT INTO usuarios (id, id_rol, email, password_hash, nombre, apellido, telefono, activo)
       VALUES (gen_random_uuid(), (SELECT id FROM roles WHERE nombre = 'ENFERMERO'), 'enfermera.elena@hospital.com', $1, 'Elena', 'Ríos', '+591 74455667', TRUE)
       ON CONFLICT (email) DO NOTHING
       RETURNING email, nombre, apellido;`,
      [hash]
    );
    console.log('Usuario Enfermera en Supabase:', res.rows.length ? res.rows[0] : 'Ya existía');
  } catch (err: any) {
    console.error('Error insertando enfermera:', err.message);
  } finally {
    await pool.end();
  }
}

addNurse();
