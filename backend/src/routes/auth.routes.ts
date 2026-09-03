import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { authenticateJWT } from '../middleware/auth.middleware';

const router = Router();

// Rutas Públicas de Autenticación
router.post('/login', AuthController.login);
router.post('/patient-login', AuthController.patientLogin);

// Rutas Protegidas de Sesión
router.get('/me', authenticateJWT, AuthController.getProfile);
router.post('/logout', authenticateJWT, AuthController.logout);

export default router;
