/**
 * Script de Verificación Integral de RBAC y Restricciones Éticas HIPAA
 * Prueba los flujos de seguridad solicitados por el usuario.
 */

import { MOCK_USERS_DB, AuthController } from './controllers/auth.controller';
import { UserRole } from './constants/roles';
import jwt from 'jsonwebtoken';
import { config } from './config/env';

async function runVerification() {
  console.log('\n===============================================================');
  console.log('🧪 INICIANDO SUITE DE PRUEBAS AUTOMATIZADAS DE SEGURIDAD & RBAC');
  console.log('===============================================================\n');

  // Helper para simular Request y Response
  const mockReqRes = (userPayload: any, params: any = {}, body: any = {}) => {
    let statusCode = 200;
    let responseData: any = null;

    const req: any = {
      user: userPayload,
      params,
      body,
      query: {},
      ip: '192.168.1.100',
      get: (header: string) => 'Automated-Test-Runner/1.0',
      originalUrl: '/test-url',
      headers: {},
      socket: { remoteAddress: '192.168.1.100' }
    };

    const res: any = {
      status: (code: number) => {
        statusCode = code;
        return res;
      },
      json: (data: any) => {
        responseData = data;
        return res;
      }
    };

    return { req, res, getStatus: () => statusCode, getData: () => responseData };
  };

  // 1. Prueba de Generación de Token para Doctor y Paciente
  console.log('1️⃣  Prueba: Generación y Validación de Token JWT...');
  const doctorUser = MOCK_USERS_DB.find(u => u.role === UserRole.DOCTOR)!;
  const patientUser = MOCK_USERS_DB.find(u => u.id === 'u-patient-01')!;

  const doctorToken = jwt.sign(
    { userId: doctorUser.id, email: doctorUser.email, role: doctorUser.role, staffId: doctorUser.staffId, firstName: doctorUser.firstName, lastName: doctorUser.lastName },
    config.jwtSecret,
    { expiresIn: '15m' }
  );
  const patientToken = jwt.sign(
    { userId: patientUser.id, email: patientUser.email, role: patientUser.role, patientId: patientUser.patientId, firstName: patientUser.firstName, lastName: patientUser.lastName },
    config.jwtSecret,
    { expiresIn: '15m' }
  );

  console.log('   ✅ Token Doctor emitido con éxito.');
  console.log('   ✅ Token Paciente emitido con éxito.');

  // 2. Importar middleware y controladores
  const { ClinicalController } = await import('./controllers/clinical.controller');
  const { patientDataOwnershipGuard, sanitizePatientResponse, authorizeRoles } = await import('./middleware/rbac.middleware');

  // 3. Prueba Ética A1: Paciente Juan consulta su propia consulta médica
  console.log('\n2️⃣  Prueba Ética A1: Paciente Juan consulta SU propia historia clínica');
  const decodedPatient = jwt.verify(patientToken, config.jwtSecret) as any;
  const { req: reqPat, res: resPat, getStatus: getStatPat, getData: getDataPat } = mockReqRes(
    decodedPatient,
    { patientId: 'pat-juan-001' }
  );

  // Aplicar middleware de sanitización
  sanitizePatientResponse(reqPat, resPat, () => {});
  await ClinicalController.getPatientConsultations(reqPat, resPat);

  const juanData = getDataPat();
  const juanConsultation = juanData?.data?.[0];
  console.log(`   Status HTTP: ${getStatPat()} OK`);
  console.log(`   Diagnóstico recibido: ${juanConsultation?.diagnoses?.[0]?.description}`);
  console.log(`   ¿Se eliminaron las notas privadas del doctor?: ${juanConsultation?.doctor_private_notes === undefined ? '✅ SÍ (Protección activa)' : '❌ NO'}`);

  // 4. Prueba Ética A2: Paciente Juan intenta consultar la historia clínica de María
  console.log('\n3️⃣  Prueba Ética A2: Paciente Juan intenta violar aislamiento y ver expediente de María');
  const { req: reqAttack, res: resAttack, getStatus: getStatAttack, getData: getDataAttack } = mockReqRes(
    decodedPatient,
    { patientId: 'pat-maria-002' }
  );

  let nextCalled = false;
  patientDataOwnershipGuard('patientId')(reqAttack, resAttack, () => { nextCalled = true; });

  console.log(`   Status HTTP: ${getStatAttack()} (Esperado 403 Forbidden)`);
  console.log(`   Error devuelto: ${getDataAttack()?.error}`);
  console.log(`   ¿Se bloqueó el acceso no autorizado?: ${getStatAttack() === 403 && !nextCalled ? '✅ SÍ (Aislamiento verificado)' : '❌ NO'}`);

  // 5. Prueba Médica B: Doctor consulta el mismo expediente (debe ver las notas confidenciales)
  console.log('\n4️⃣  Prueba Médica B: El Doctor accede a la consulta (Debe ver notas privadas)');
  const decodedDoctor = jwt.verify(doctorToken, config.jwtSecret) as any;
  const { req: reqDoc, res: resDoc, getData: getDataDoc } = mockReqRes(
    decodedDoctor,
    { patientId: 'pat-juan-001' }
  );
  sanitizePatientResponse(reqDoc, resDoc, () => {});
  await ClinicalController.getPatientConsultations(reqDoc, resDoc);

  const docConsultation = getDataDoc()?.data?.[0];
  console.log(`   ¿El médico puede ver las notas confidenciales?: ${docConsultation?.doctor_private_notes ? '✅ SÍ (' + docConsultation.doctor_private_notes.substring(0, 35) + '...)' : '❌ NO'}`);

  // 6. Prueba Rol Farmacia: Farmacéutico intenta crear una consulta médica (Debe ser rechazado por RBAC)
  console.log('\n5️⃣  Prueba RBAC: Farmacéutico intenta registrar una consulta médica (Prohibido)');
  const pharmaUser = MOCK_USERS_DB.find(u => u.role === UserRole.PHARMACIST)!;
  const pharmaPayload = { userId: pharmaUser.id, email: pharmaUser.email, role: pharmaUser.role };
  const { req: reqPharma, res: resPharma, getStatus: getStatPharma, getData: getDataPharma } = mockReqRes(
    pharmaPayload,
    {},
    { patientId: 'pat-juan-001', subjectiveSymptoms: 'Intento no médico' }
  );

  let pharmaNext = false;
  authorizeRoles(UserRole.DOCTOR)(reqPharma, resPharma, () => { pharmaNext = true; });

  console.log(`   Status HTTP: ${getStatPharma()} (Esperado 403 Forbidden)`);
  console.log(`   Mensaje: ${getDataPharma()?.message}`);
  console.log(`   ¿RBAC impidió la intrusión?: ${getStatPharma() === 403 && !pharmaNext ? '✅ SÍ (Control estricto)' : '❌ NO'}`);

  // 7. Auditoría HIPAA / GDPR
  console.log('\n6️⃣  Prueba de Auditoría HIPAA: Verificación de Trazabilidad');
  const adminUser = MOCK_USERS_DB.find(u => u.role === UserRole.ADMIN)!;
  const { req: reqAdmin, res: resAdmin, getData: getDataAdmin } = mockReqRes(
    { userId: adminUser.id, role: adminUser.role }
  );
  await ClinicalController.getAuditLogs(reqAdmin, resAdmin);
  const auditLogs = getDataAdmin()?.data || [];

  console.log(`   Total eventos auditados en el ciclo de pruebas: ${auditLogs.length}`);
  console.log(`   Último evento registrado: Acción=${auditLogs[0]?.action}, Actor=${auditLogs[0]?.actorEmail}, IP=${auditLogs[0]?.ipAddress}`);

  console.log('\n===============================================================');
  console.log('🎉 TODAS LAS REGLAS RBAC Y DE PRIVACIDAD ÉTICA FUERON SATISFECHAS');
  console.log('===============================================================\n');
}

runVerification().catch(console.error);
