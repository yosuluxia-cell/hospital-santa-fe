/**
 * Roles del Sistema y Matriz RBAC (Role-Based Access Control)
 * Sistema de Gestión Hospitalaria y EMR
 */

export enum UserRole {
  ADMIN = 'ADMIN',
  DOCTOR = 'DOCTOR',
  NURSE = 'NURSE',
  LAB_TECH = 'LAB_TECH',
  RADIOLOGIST = 'RADIOLOGIST',
  PHARMACIST = 'PHARMACIST',
  RECEPTIONIST = 'RECEPTIONIST',
  PATIENT = 'PATIENT',
}

export function normalizeRole(roleStr: string): UserRole {
  const map: Record<string, UserRole> = {
    'ADMIN': UserRole.ADMIN,
    'DOCTOR': UserRole.DOCTOR,
    'MEDICO': UserRole.DOCTOR,
    'ENFERMERO': UserRole.NURSE,
    'NURSE': UserRole.NURSE,
    'LAB_TECH': UserRole.LAB_TECH,
    'LAB_TECNICO': UserRole.LAB_TECH,
    'RADIOLOGIST': UserRole.RADIOLOGIST,
    'RADIOLOGO': UserRole.RADIOLOGIST,
    'PHARMACIST': UserRole.PHARMACIST,
    'FARMACEUTICO': UserRole.PHARMACIST,
    'RECEPTIONIST': UserRole.RECEPTIONIST,
    'RECEPCIONISTA': UserRole.RECEPTIONIST,
    'PATIENT': UserRole.PATIENT,
    'PACIENTE': UserRole.PATIENT,
  };
  return map[roleStr.toUpperCase()] || UserRole.PATIENT;
}

export enum Permission {
  // Módulo Pacientes
  PATIENT_READ_OWN = 'patient:read_own',
  PATIENT_READ_ALL = 'patient:read_all',
  PATIENT_CREATE = 'patient:create',
  PATIENT_UPDATE = 'patient:update',

  // Citas y Fichas Médicas
  APPOINTMENT_SCHEDULE_OWN = 'appointment:schedule_own',
  APPOINTMENT_SCHEDULE_ANY = 'appointment:schedule_any',
  APPOINTMENT_CANCEL_OWN = 'appointment:cancel_own',
  APPOINTMENT_CANCEL_ANY = 'appointment:cancel_any',

  // Expediente Clínico (EHR / Consultas)
  EHR_CREATE = 'ehr:create',
  EHR_READ_ASSIGNED = 'ehr:read_assigned',
  EHR_READ_OWN = 'ehr:read_own', // Paciente leyendo su propio historial público
  EHR_READ_PRIVATE_NOTES = 'ehr:read_private_notes', // Exclusivo del médico tratante
  EHR_UPDATE_ASSIGNED = 'ehr:update_assigned',

  // Triaje y Signos Vitales
  TRIAGE_RECORD = 'triage:record',
  TRIAGE_READ = 'triage:read',

  // Exámenes y Laboratorio / Radiología
  LAB_ORDER_CREATE = 'lab:order_create',
  LAB_RESULT_UPLOAD = 'lab:result_upload',
  LAB_RESULT_READ_OWN = 'lab:result_read_own',
  LAB_RESULT_READ_ASSIGNED = 'lab:result_read_assigned',

  // Farmacia y Recetas
  PRESCRIPTION_CREATE = 'prescription:create',
  PRESCRIPTION_DISPENSE = 'prescription:dispense',
  PRESCRIPTION_READ_OWN = 'prescription:read_own',
  PRESCRIPTION_READ_ALL = 'prescription:read_all',

  // Administración y Caja
  BILLING_MANAGE = 'billing:manage',
  USER_MANAGE = 'user:manage',
  AUDIT_LOGS_READ = 'audit:logs_read',
}

/**
 * Matriz de Permisos por Rol
 */
export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  [UserRole.ADMIN]: [
    Permission.PATIENT_READ_ALL,
    Permission.PATIENT_CREATE,
    Permission.PATIENT_UPDATE,
    Permission.APPOINTMENT_SCHEDULE_ANY,
    Permission.APPOINTMENT_CANCEL_ANY,
    Permission.USER_MANAGE,
    Permission.AUDIT_LOGS_READ,
    Permission.BILLING_MANAGE,
    Permission.TRIAGE_READ,
  ],
  [UserRole.DOCTOR]: [
    Permission.PATIENT_READ_ALL,
    Permission.APPOINTMENT_SCHEDULE_ANY,
    Permission.EHR_CREATE,
    Permission.EHR_READ_ASSIGNED,
    Permission.EHR_READ_PRIVATE_NOTES,
    Permission.EHR_UPDATE_ASSIGNED,
    Permission.TRIAGE_READ,
    Permission.LAB_ORDER_CREATE,
    Permission.LAB_RESULT_READ_ASSIGNED,
    Permission.PRESCRIPTION_CREATE,
  ],
  [UserRole.NURSE]: [
    Permission.PATIENT_READ_ALL,
    Permission.TRIAGE_RECORD,
    Permission.TRIAGE_READ,
    Permission.EHR_READ_ASSIGNED,
    Permission.LAB_RESULT_READ_ASSIGNED,
  ],
  [UserRole.LAB_TECH]: [
    Permission.LAB_RESULT_UPLOAD,
    Permission.LAB_RESULT_READ_ASSIGNED,
  ],
  [UserRole.RADIOLOGIST]: [
    Permission.LAB_RESULT_UPLOAD,
    Permission.LAB_RESULT_READ_ASSIGNED,
  ],
  [UserRole.PHARMACIST]: [
    Permission.PRESCRIPTION_READ_ALL,
    Permission.PRESCRIPTION_DISPENSE,
  ],
  [UserRole.RECEPTIONIST]: [
    Permission.PATIENT_CREATE,
    Permission.PATIENT_UPDATE,
    Permission.PATIENT_READ_ALL,
    Permission.APPOINTMENT_SCHEDULE_ANY,
    Permission.APPOINTMENT_CANCEL_ANY,
    Permission.BILLING_MANAGE,
  ],
  [UserRole.PATIENT]: [
    Permission.PATIENT_READ_OWN,
    Permission.APPOINTMENT_SCHEDULE_OWN,
    Permission.APPOINTMENT_CANCEL_OWN,
    Permission.EHR_READ_OWN, // Solo vista de paciente: sin notas privadas
    Permission.LAB_RESULT_READ_OWN,
    Permission.PRESCRIPTION_READ_OWN,
  ],
};
