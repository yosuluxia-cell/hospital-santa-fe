/**
 * Acciones de Auditoría para Cumplimiento HIPAA & GDPR
 */

export enum AuditAction {
  LOGIN_SUCCESS = 'LOGIN_SUCCESS',
  LOGIN_FAILED = 'LOGIN_FAILED',
  LOGOUT = 'LOGOUT',
  CREATE = 'CREATE',
  READ_PHI = 'READ_PHI', // Acceso a información de salud protegida (Protected Health Information)
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  EXPORT_PDF = 'EXPORT_PDF',
  DISPENSE_MEDICATION = 'DISPENSE_MEDICATION',
  BREAK_GLASS_ACCESS = 'BREAK_GLASS_ACCESS', // Protocolo de emergencia para romper el cerco en riesgo de vida
}
