import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';
import { UserRole } from '../constants/roles';

export interface TokenPayload {
  userId: string;
  email: string;
  role: UserRole;
  staffId?: string;
  patientId?: string;
  firstName: string;
  lastName: string;
}

// Extensión de la interfaz Request de Express
declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

/**
 * Middleware de Autenticación JWT
 * Valida el token Bearer en las cabeceras HTTP y extrae el usuario autenticado.
 */
export const authenticateJWT = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      error: 'UNAUTHORIZED',
      message: 'Cabecera de autorización ausente o con formato inválido. Debe usar: Bearer <token>',
    });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, config.jwtSecret) as TokenPayload;
    req.user = decoded;
    next();
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      res.status(401).json({
        success: false,
        error: 'TOKEN_EXPIRED',
        message: 'El token de acceso ha expirado. Por favor, utilice su Refresh Token para renovarlo.',
      });
      return;
    }

    res.status(403).json({
      success: false,
      error: 'INVALID_TOKEN',
      message: 'Firma de token inválida o token adulterado.',
    });
    return;
  }
};

/**
 * Middleware de Autenticación Opcional
 * Extrae req.user si el token está presente y es válido, pero no bloquea si la solicitud es anónima.
 */
export const optionalAuthJWT = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, config.jwtSecret) as TokenPayload;
      req.user = decoded;
    } catch (_) {
      // Continuar como solicitud pública sin autenticación
    }
  }
  next();
};

