import fs from 'fs';
import path from 'path';
import { pool } from './db';
import { config } from '../config/env';

function getSqlFile(filename: string): string {
  const possiblePaths = [
    path.join(__dirname, filename),
    path.join(__dirname, '../../src/database', filename),
    path.join(process.cwd(), 'src/database', filename),
    path.join(process.cwd(), 'backend/src/database', filename)
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return fs.readFileSync(p, 'utf-8');
    }
  }
  throw new Error(`No se encontró el archivo SQL: ${filename}`);
}

async function initDatabase() {
  console.log('\n===============================================================');
  console.log('🚀 INICIALIZADOR DE BASE DE DATOS POSTGRESQL');
  console.log(`📡 URL Conexión: ${config.databaseUrl ? config.databaseUrl.replace(/:[^:@]+@/, ':****@') : 'Localhost'}`);
  console.log(`🔒 Modo SSL: ${config.dbSsl ? 'ACTIVADO' : 'DESACTIVADO'}`);
  console.log('===============================================================\n');

  const client = await pool.connect();

  try {
    // 1. Ejecutar Script 01: Creación de tablas
    console.log('1️⃣  Leyendo y ejecutando 01_tablas_principales.sql...');
    const sql01 = getSqlFile('01_tablas_principales.sql');
    await client.query(sql01);
    console.log('   ✅ Tablas creadas con éxito (roles, usuarios, medicos, pacientes, citas, registros_medicos, diagnosticos_cie, recetas, auditoria_accesos).');

    // 2. Ejecutar Script 02: Inserción de datos semilla
    console.log('\n2️⃣  Leyendo y ejecutando 02_datos_semilla.sql...');
    const sql02 = getSqlFile('02_datos_semilla.sql');
    await client.query(sql02);
    console.log('   ✅ Datos semilla insertados con éxito (roles, admin, doctor, pacientes, cita y consulta con CIE-10).');

    // 3. Verificación de conteos
    console.log('\n📊 Verificación de registros en la base de datos:');
    const { rows: rolesRows } = await client.query('SELECT COUNT(*) FROM roles');
    const { rows: userRows } = await client.query('SELECT COUNT(*) FROM usuarios');
    const { rows: patientRows } = await client.query('SELECT COUNT(*) FROM pacientes');
    const { rows: appointmentRows } = await client.query('SELECT COUNT(*) FROM citas');
    const { rows: recordsRows } = await client.query('SELECT COUNT(*) FROM registros_medicos');
    const { rows: diagRows } = await client.query('SELECT COUNT(*) FROM diagnosticos_cie');

    console.log(`   - Roles: ${rolesRows[0].count}`);
    console.log(`   - Usuarios: ${userRows[0].count}`);
    console.log(`   - Pacientes: ${patientRows[0].count}`);
    console.log(`   - Citas programadas: ${appointmentRows[0].count}`);
    console.log(`   - Registros médicos: ${recordsRows[0].count}`);
    console.log(`   - Diagnósticos CIE-10: ${diagRows[0].count}`);

    console.log('\n===============================================================');
    console.log('🎉 BASE DE DATOS CONFIGURADA Y POBLADA EXITOSAMENTE');
    console.log('===============================================================\n');
  } catch (error: any) {
    console.error('\n❌ ERROR AL INICIALIZAR BASE DE DATOS:');
    console.error(error.message);
    console.log('\n💡 Sugerencia:');
    console.log('1. Verifica que la variable DATABASE_URL en tu .env tenga el formato correcto y permisos de superusuario/creación de tablas.');
    console.log('2. En proveedores como Supabase o Neon, asegúrate de que el SSL esté activado (sslmode=require o DB_SSL=true).');
  } finally {
    client.release();
    await pool.end();
  }
}

initDatabase().catch(console.error);
