import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';
import { UserRole, normalizeRole } from '../constants/roles';
import { AuditAction } from '../constants/auditActions';
import { auditService } from '../services/audit.service';
import { TokenPayload } from '../middleware/auth.middleware';
import { pool } from '../database/db';

interface MockUser {
  id: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  firstName: string;
  lastName: string;
  staffId?: string;
  patientId?: string;
  isActive: boolean;
}

const DEFAULT_PASSWORD_HASH = bcrypt.hashSync('ClinicaSegura2026!', 10);

export const MOCK_USERS_DB: MockUser[] = [
  {
    id: 'u-admin-01',
    email: 'admin@hospital.com',
    passwordHash: DEFAULT_PASSWORD_HASH,
    role: UserRole.ADMIN,
    firstName: 'Carlos',
    lastName: 'Valenzuela',
    isActive: true,
  },
  {
    id: 'u-doc-01',
    email: 'dr.mendoza@hospital.com',
    passwordHash: DEFAULT_PASSWORD_HASH,
    role: UserRole.DOCTOR,
    firstName: 'Alejandro',
    lastName: 'Mendoza',
    staffId: 'b0000000-0000-0000-0000-000000000001',
    isActive: true,
  },
  {
    id: 'u-nurse-01',
    email: 'enfermera.elena@hospital.com',
    passwordHash: DEFAULT_PASSWORD_HASH,
    role: UserRole.NURSE,
    firstName: 'Elena',
    lastName: 'Ríos',
    staffId: 'staff-nurse-001',
    isActive: true,
  },
  {
    id: 'u-patient-01',
    email: 'paciente.juan@gmail.com',
    passwordHash: DEFAULT_PASSWORD_HASH,
    role: UserRole.PATIENT,
    firstName: 'Juan',
    lastName: 'Pérez',
    patientId: 'c0000000-0000-0000-0000-000000000001',
    isActive: true,
  },
  {
    id: 'u-patient-02',
    email: 'paciente.maria@gmail.com',
    passwordHash: DEFAULT_PASSWORD_HASH,
    role: UserRole.PATIENT,
    firstName: 'María',
    lastName: 'Gómez',
    patientId: 'c0000000-0000-0000-0000-000000000002',
    isActive: true,
  },
];

export class AuthController {
  /**
   * Endpoint: POST /api/auth/login
   * Autenticación universal para Personal Médico, Enfermería, Administración y Usuarios
   * Acepta: Correo Electrónico, CI o Matrícula Profesional + Contraseña
   */
  public static async login(req: Request, res: Response): Promise<void> {
    const credential = (req.body.email || req.body.identifier || req.body.ci || '').trim();
    const password = req.body.password;
    const ipAddress = req.ip || req.socket.remoteAddress || '127.0.0.1';
    const userAgent = req.get('user-agent') || 'Unknown';

    if (!credential || !password) {
      res.status(400).json({
        success: false,
        error: 'MISSING_FIELDS',
        message: 'Debe ingresar su usuario/correo/CI y su contraseña.',
      });
      return;
    }

    let user: MockUser | null = null;

    try {
      const dbRes = await pool.query(
        `SELECT u.id, u.email, u.password_hash, u.nombre, u.apellido, u.activo, r.nombre AS rol,
                m.id AS staff_id, p.id AS patient_id, p.documento_identidad
         FROM usuarios u
         JOIN roles r ON u.id_rol = r.id
         LEFT JOIN medicos m ON m.id_usuario = u.id
         LEFT JOIN pacientes p ON p.id_usuario = u.id
         WHERE LOWER(u.email) = LOWER($1)
            OR LOWER(COALESCE(p.documento_identidad, '')) = LOWER($1)
            OR REPLACE(LOWER(COALESCE(p.documento_identidad, '')), 'ci-', '') = LOWER(REPLACE($1, 'ci-', ''))
            OR LOWER(COALESCE(m.matricula_profesional, '')) = LOWER($1)`,
        [credential]
      );

      if (dbRes.rows.length > 0) {
        const row = dbRes.rows[0];
        user = {
          id: row.id,
          email: row.email,
          passwordHash: row.password_hash,
          role: normalizeRole(row.rol),
          firstName: row.nombre,
          lastName: row.apellido,
          staffId: row.staff_id || undefined,
          patientId: row.patient_id || undefined,
          isActive: row.activo,
        };
      }
    } catch (dbErr: any) {
      console.warn('[AUTH WARNING] Falla al consultar usuarios en PostgreSQL:', dbErr.message);
    }

    // Fallback en memoria si la BD no lo encuentra
    if (!user) {
      const mock = MOCK_USERS_DB.find((u) => 
        u.email.toLowerCase() === credential.toLowerCase() ||
        (u.staffId && u.staffId.toLowerCase() === credential.toLowerCase())
      );
      if (mock) user = mock;
    }

    if (!user) {
      await auditService.log({
        actorEmail: credential,
        actorRole: 'ANONYMOUS',
        action: AuditAction.LOGIN_FAILED,
        resource: 'AUTH_SERVICE',
        ipAddress,
        userAgent,
        details: { reason: 'Usuario no encontrado' },
      });

      res.status(401).json({
        success: false,
        error: 'INVALID_CREDENTIALS',
        message: 'Credenciales de acceso incorrectas.',
      });
      return;
    }

    if (!user.isActive) {
      res.status(403).json({
        success: false,
        error: 'ACCOUNT_DISABLED',
        message: 'Esta cuenta de usuario ha sido desactivada.',
      });
      return;
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      await auditService.log({
        actorId: user.id,
        actorEmail: user.email,
        actorRole: user.role,
        action: AuditAction.LOGIN_FAILED,
        resource: 'AUTH_SERVICE',
        ipAddress,
        userAgent,
        details: { reason: 'Contraseña incorrecta' },
      });

      res.status(401).json({
        success: false,
        error: 'INVALID_CREDENTIALS',
        message: 'Credenciales de acceso incorrectas.',
      });
      return;
    }

    // Generación de Tokens JWT con Role RBAC
    const payload: TokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      staffId: user.staffId,
      patientId: user.patientId,
      firstName: user.firstName,
      lastName: user.lastName,
    };

    const accessToken = jwt.sign(payload, config.jwtSecret, {
      expiresIn: config.jwtExpiresIn as any,
    });

    const refreshToken = jwt.sign({ userId: user.id }, config.jwtRefreshSecret, {
      expiresIn: config.jwtRefreshExpiresIn as any,
    });

    await auditService.log({
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: AuditAction.LOGIN_SUCCESS,
      resource: 'AUTH_SERVICE',
      ipAddress,
      userAgent,
      details: { role: user.role },
    });

    res.status(200).json({
      success: true,
      message: `Autenticación exitosa como ${user.role}`,
      data: {
        accessToken,
        refreshToken,
        expiresIn: config.jwtExpiresIn,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          firstName: user.firstName,
          lastName: user.lastName,
          staffId: user.staffId,
          patientId: user.patientId,
        },
      },
    });
  }

  /**
   * Endpoint: POST /api/auth/patient-login
   * Acceso exclusivo para Pacientes mediante Cédula de Identidad (CI) o ID único
   */
  public static async patientLogin(req: Request, res: Response): Promise<void> {
    const ci = (req.body.ci || req.body.identifier || req.body.documento_identidad || '').trim();
    const ipAddress = req.ip || req.socket.remoteAddress || '127.0.0.1';
    const userAgent = req.get('user-agent') || 'Unknown';

    if (!ci) {
      res.status(400).json({
        success: false,
        error: 'MISSING_CI',
        message: 'Debe ingresar su Cédula de Identidad (CI).',
      });
      return;
    }

    try {
      const dbRes = await pool.query(
        `SELECT p.id AS patient_id, p.documento_identidad, p.nombre, p.apellido, p.alergias, p.tipo_sangre,
                u.id AS user_id, u.email, u.activo, r.nombre AS rol
         FROM pacientes p
         JOIN usuarios u ON p.id_usuario = u.id
         JOIN roles r ON u.id_rol = r.id
         WHERE LOWER(p.documento_identidad) = LOWER($1)
            OR REPLACE(LOWER(p.documento_identidad), 'ci-', '') = LOWER(REPLACE($1, 'ci-', ''))
            OR LOWER(u.email) = LOWER($1)`,
        [ci]
      );

      if (dbRes.rows.length === 0) {
        res.status(404).json({
          success: false,
          error: 'PATIENT_NOT_FOUND',
          message: `No se encontró ningún paciente registrado con la Cédula de Identidad '${ci}'.`,
        });
        return;
      }

      const row = dbRes.rows[0];

      if (!row.activo) {
        res.status(403).json({
          success: false,
          error: 'ACCOUNT_DISABLED',
          message: 'Su registro de paciente se encuentra temporalmente inactivo.',
        });
        return;
      }

      const tokenPayload: TokenPayload = {
        userId: row.user_id,
        email: row.email,
        role: UserRole.PATIENT,
        patientId: row.patient_id,
        firstName: row.nombre,
        lastName: row.apellido,
      };

      const accessToken = jwt.sign(tokenPayload, config.jwtSecret, { expiresIn: '2h' });

      await auditService.log({
        actorId: row.user_id,
        actorEmail: row.email,
        actorRole: UserRole.PATIENT,
        action: AuditAction.LOGIN_SUCCESS,
        resource: 'PATIENT_PORTAL_CI',
        ipAddress,
        userAgent,
        details: { method: 'CI_ACCESS', ci: row.documento_identidad },
      });

      res.status(200).json({
        success: true,
        message: `¡Bienvenido(a), ${row.nombre} ${row.apellido}!`,
        data: {
          accessToken,
          user: {
            id: row.user_id,
            email: row.email,
            role: UserRole.PATIENT,
            firstName: row.nombre,
            lastName: row.apellido,
            patientId: row.patient_id,
            ci: row.documento_identidad,
            alergias: row.alergias,
            tipoSangre: row.tipo_sangre,
          },
        },
      });
    } catch (error: any) {
      console.error('[PATIENT CI LOGIN ERROR]:', error.message);
      res.status(500).json({
        success: false,
        error: 'SERVER_ERROR',
        message: 'Error al procesar el acceso del paciente: ' + error.message,
      });
    }
  }

  /**
   * Endpoint: GET /api/auth/me
   */
  public static async getProfile(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'No autenticado' });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        user: req.user,
      },
    });
  }

  /**
   * Endpoint: POST /api/auth/logout
   */
  public static async logout(req: Request, res: Response): Promise<void> {
    if (req.user) {
      await auditService.log({
        actorId: req.user.userId,
        actorEmail: req.user.email,
        actorRole: req.user.role,
        action: AuditAction.LOGOUT,
        resource: 'AUTH_SERVICE',
        ipAddress: req.ip || req.socket.remoteAddress || '127.0.0.1',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Sesión finalizada correctamente.',
    });
  }
}
