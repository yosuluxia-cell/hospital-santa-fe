import { Router } from 'express';
import { ClinicalController } from '../controllers/clinical.controller';
import { authenticateJWT, optionalAuthJWT } from '../middleware/auth.middleware';
import {
  authorizeRoles,
  patientDataOwnershipGuard,
  sanitizePatientResponse
} from '../middleware/rbac.middleware';
import { UserRole } from '../constants/roles';

const router = Router();

/**
 * CATÁLOGO DE DIAGNÓSTICOS CIE-10 (Búsqueda y Autocompletado)
 */
router.get('/cie10', authenticateJWT, ClinicalController.getCie10);

/**
 * LISTA DE MÉDICOS
 */
router.get('/doctors', ClinicalController.getDoctorsList);

/**
 * AGENDA DE CITAS DEL MÉDICO
 * - Exclusivo para Médicos, Enfermeros, Recepción y Administradores.
 */
router.get(
  '/doctor/appointments',
  authenticateJWT,
  authorizeRoles(UserRole.DOCTOR, UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.NURSE),
  ClinicalController.getDoctorAppointments
);

/**
 * CITAS DEL PACIENTE
 */
router.get(
  '/patients/:patientId/appointments',
  authenticateJWT,
  authorizeRoles(UserRole.PATIENT, UserRole.DOCTOR, UserRole.ADMIN, UserRole.RECEPTIONIST),
  patientDataOwnershipGuard('patientId'),
  ClinicalController.getPatientAppointments
);

/**
 * AGENDAR Y CANCELAR CITAS (Público y Autenticado)
 */
router.post('/appointments', optionalAuthJWT, ClinicalController.scheduleAppointment);
router.patch('/appointments/:appointmentId/cancel', authenticateJWT, ClinicalController.cancelAppointment);

/**
 * TRIAJE MANCHESTER Y CONSTANTES VITALES
 * Exclusivo para personal de Enfermería, Facultativos y Administradores
 */
router.patch(
  '/appointments/:appointmentId/triage',
  authenticateJWT,
  authorizeRoles(UserRole.NURSE, UserRole.DOCTOR, UserRole.ADMIN),
  ClinicalController.updateTriage
);

/**
 * REGISTRO Y ADMISIÓN DE PACIENTES NUEVOS
 * Estrictamente exclusivo para el personal de Enfermería y Administración de Seguridad.
 */
router.post(
  '/patients/admission',
  authenticateJWT,
  authorizeRoles(UserRole.NURSE, UserRole.ADMIN),
  ClinicalController.createAdmission
);

/**
 * CONSULTA DE HISTORIA CLÍNICA (EHR / CONSULTAS)
 * - Requiere token válido (authenticateJWT).
 * - Control de Roles: Médicos, Enfermeros y Pacientes.
 * - Guardia de Propiedad de Datos: Si es Paciente, solo puede ver SU propio expediente.
 * - Sanitización Ética de Respuesta: Si es Paciente, se eliminan notas privadas del doctor.
 */
router.get(
  '/patients/:patientId/consultations',
  authenticateJWT,
  authorizeRoles(UserRole.DOCTOR, UserRole.NURSE, UserRole.PATIENT, UserRole.ADMIN),
  patientDataOwnershipGuard('patientId'),
  sanitizePatientResponse,
  ClinicalController.getPatientConsultations
);

/**
 * REGISTRO DE NUEVA CONSULTA MÉDICA
 * - Restricción Ética: Solo Médicos pueden crear notas de evolución y diagnósticos.
 */
router.post(
  '/consultations',
  authenticateJWT,
  authorizeRoles(UserRole.DOCTOR),
  ClinicalController.createConsultation
);

/**
 * RECETAS MÉDICAS
 * - Paciente puede ver sus recetas.
 * - Farmacéuticos, enfermeros y médicos pueden consultarlas.
 */
router.get(
  '/patients/:patientId/prescriptions',
  authenticateJWT,
  authorizeRoles(UserRole.PATIENT, UserRole.DOCTOR, UserRole.NURSE, UserRole.PHARMACIST),
  patientDataOwnershipGuard('patientId'),
  ClinicalController.getPrescriptions
);

/**
 * AUDIT TRAIL / LOGS DE ACCESO Y MODIFICACIÓN
 * - Exclusivo para Administrador de TI / Seguridad Hospitalaria.
 */
router.get(
  '/admin/audit-logs',
  authenticateJWT,
  authorizeRoles(UserRole.ADMIN),
  ClinicalController.getAuditLogs
);

export default router;
