import { Request, Response, NextFunction } from 'express';
import { UserRole, Permission, ROLE_PERMISSIONS } from '../constants/roles';
import { AuditAction } from '../constants/auditActions';
import { auditService } from '../services/audit.service';

/**
 * Middleware de Autorización por Roles (RBAC Básico)
 * Verifica si el rol del usuario autenticado coincide con los roles permitidos.
 */
export const authorizeRoles = (...allowedRoles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'No se encontró la identidad del usuario en la solicitud.',
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      // Registrar intento de acceso no autorizado en la auditoría
      auditService.log({
        actorId: req.user.userId,
        actorEmail: req.user.email,
        actorRole: req.user.role,
        action: AuditAction.READ_PHI,
        resource: req.originalUrl,
        ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
        userAgent: req.get('user-agent'),
        details: {
          blocked: true,
          reason: `Rol [${req.user.role}] no tiene permiso para acceder a esta ruta. Requiere: ${allowedRoles.join(', ')}`,
        },
      });

      res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: `Acceso denegado. Su rol (${req.user.role}) no tiene permisos para este recurso médico.`,
      });
      return;
    }

    next();
  };
};

/**
 * Middleware de Permisos Granulares
 */
export const authorizePermission = (requiredPermission: Permission) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Usuario no autenticado.' });
      return;
    }

    const userPermissions = ROLE_PERMISSIONS[req.user.role] || [];
    if (!userPermissions.includes(requiredPermission)) {
      res.status(403).json({
        success: false,
        error: 'PERMISSION_DENIED',
        message: `Permiso insuficiente: se requiere '${requiredPermission}'.`,
      });
      return;
    }

    next();
  };
};

/**
 * Restricción Ética A: Patient Data Ownership Guard
 * Garantiza que un paciente NUNCA pueda consultar o solicitar información de otros pacientes.
 */
export const patientDataOwnershipGuard = (patientIdParamKey = 'patientId') => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'No autenticado.' });
      return;
    }

    // Si el usuario es un Paciente, solo puede consultar su propio ID
    if (req.user.role === UserRole.PATIENT) {
      const targetPatientId = req.params[patientIdParamKey] || req.query[patientIdParamKey] || req.body[patientIdParamKey];
      
      if (!targetPatientId || targetPatientId !== req.user.patientId) {
        auditService.log({
          actorId: req.user.userId,
          actorEmail: req.user.email,
          actorRole: req.user.role,
          action: AuditAction.READ_PHI,
          resource: 'PATIENT_ISOLATION_GUARD',
          patientId: targetPatientId,
          ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
          details: { violation: 'Paciente intentó consultar expediente ajeno.' },
        });

        res.status(403).json({
          success: false,
          error: 'PATIENT_ISOLATION_VIOLATION',
          message: 'Violación de seguridad y privacidad: Solo tiene autorización para acceder a sus propios registros.',
        });
        return;
      }
    }

    next();
  };
};

/**
 * Restricción Ética B: Doctor Direct Care Relationship
 * Valida que un médico solo acceda a historiales de pacientes bajo su atención directa
 * o departamento asignado, salvo que se active el protocolo Break-Glass de emergencia.
 */
export const doctorDirectCareGuard = (
  patientCareValidator: (doctorId: string, patientId: string) => Promise<boolean>
) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'No autenticado.' });
      return;
    }

    // El Administrador de TI no ve expedientes por esta vía a menos que sea break glass
    if (req.user.role === UserRole.DOCTOR) {
      const patientId = req.params.patientId || req.body.patientId;
      const isBreakGlass = req.headers['x-break-glass-reason'];

      if (isBreakGlass) {
        // Acceso de Emergencia Vital (Break-Glass): Auditar inmediatamente
        await auditService.log({
          actorId: req.user.userId,
          actorEmail: req.user.email,
          actorRole: req.user.role,
          action: AuditAction.BREAK_GLASS_ACCESS,
          resource: 'MEDICAL_CONSULTATION',
          patientId,
          ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
          details: { reason: isBreakGlass, note: 'Acceso de emergencia médica extraordinario activado' },
        });
        next();
        return;
      }

      if (patientId && req.user.staffId) {
        const hasRelationship = await patientCareValidator(req.user.staffId, patientId);
        if (!hasRelationship) {
          res.status(403).json({
            success: false,
            error: 'NO_TREATMENT_RELATIONSHIP',
            message: 'No posee una relación de atención activa o cita asignada con este paciente.',
          });
          return;
        }
      }
    }

    next();
  };
};

/**
 * Restricción Ética A: Sanitización de Notas Privadas del Médico
 * Modifica el método res.json para filtrar 'doctor_private_notes' si el solicitante es el Paciente.
 */
export const sanitizePatientResponse = (req: Request, res: Response, next: NextFunction): void => {
  const originalJson = res.json.bind(res);

  res.json = (body: any): Response => {
    if (req.user && req.user.role === UserRole.PATIENT && body) {
      const cleanData = (item: any): any => {
        if (!item || typeof item !== 'object') return item;
        if (Array.isArray(item)) return item.map(cleanData);

        const copy = { ...item };
        // Eliminar campos confidenciales de uso exclusivo del médico
        delete copy.notas_privadas_doctor;
        delete copy.doctor_private_notes;
        delete copy.doctorPrivateNotes;
        delete copy.internal_notes;

        for (const key of Object.keys(copy)) {
          if (typeof copy[key] === 'object') {
            copy[key] = cleanData(copy[key]);
          }
        }
        return copy;
      };

      body = cleanData(body);
    }
    return originalJson(body);
  };

  next();
};
