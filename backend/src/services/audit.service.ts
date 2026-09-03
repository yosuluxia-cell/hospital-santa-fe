import { AuditAction } from '../constants/auditActions';
import { UserRole } from '../constants/roles';
import { pool } from '../database/db';

export interface AuditLogEntry {
  actorId?: string;
  actorEmail?: string;
  actorRole: UserRole | string;
  action: AuditAction;
  resource: string;
  resourceId?: string;
  patientId?: string;
  ipAddress: string;
  userAgent?: string;
  details?: Record<string, any>;
  timestamp?: Date;
}

/**
 * Servicio de Auditoría Inmutable (HIPAA / GDPR Audit Trail)
 * Registra cada acceso a expedientes, modificaciones, inicios de sesión y dispensaciones
 * tanto en memoria para observabilidad como en la tabla `auditoria_accesos` de PostgreSQL.
 */
class AuditService {
  private inMemoryLogs: AuditLogEntry[] = [];

  public async log(entry: AuditLogEntry): Promise<void> {
    const logRecord: AuditLogEntry = {
      ...entry,
      timestamp: new Date(),
    };

    // 1. Registro en memoria
    this.inMemoryLogs.unshift(logRecord);
    if (this.inMemoryLogs.length > 500) {
      this.inMemoryLogs.pop();
    }

    // 2. Salida formateada en consola
    console.log(
      `[AUDIT TRAIL ${logRecord.timestamp?.toISOString()}] ` +
      `Actor: [${entry.actorEmail || 'ANONYMOUS'} (${entry.actorRole})] | ` +
      `Action: ${entry.action} | Resource: ${entry.resource}${entry.resourceId ? `(#${entry.resourceId})` : ''} | ` +
      `PatientID: ${entry.patientId || 'N/A'} | IP: ${entry.ipAddress}`
    );

    // 3. Persistencia inmutable en PostgreSQL (auditoria_accesos)
    try {
      await pool.query(
        `INSERT INTO auditoria_accesos 
         (id_usuario, email_usuario, rol_usuario, accion, recurso, id_recurso, id_paciente, ip_origen, user_agent, detalles)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          entry.actorId || null,
          entry.actorEmail || null,
          entry.actorRole,
          entry.action,
          entry.resource,
          entry.resourceId || null,
          entry.patientId || null,
          entry.ipAddress,
          entry.userAgent || null,
          entry.details ? JSON.stringify(entry.details) : null,
        ]
      );
    } catch (dbErr: any) {
      // Si la base de datos no está disponible o falla temporalmente, no rompemos la transacción clínica
      console.warn('[AUDIT WARNING] No se pudo persistir en tabla auditoria_accesos:', dbErr.message);
    }
  }

  public getRecentLogs(limit = 50): AuditLogEntry[] {
    return this.inMemoryLogs.slice(0, limit);
  }
}

export const auditService = new AuditService();
