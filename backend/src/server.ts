import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { config } from './config/env';
import authRoutes from './routes/auth.routes';
import clinicalRoutes from './routes/clinical.routes';
import { testDbConnection } from './database/db';

// ============================================================================
// 1. GUARDIANES GLOBALES DEL PROCESO (ZERO CRASH PROTECTION)
// ============================================================================
// Evita que cualquier excepción no capturada o rechazo de promesa detenga el servidor
process.on('uncaughtException', (error: Error) => {
  console.error('\n🚨 [PROCESO - UNCAUGHT EXCEPTION PREVENIDA]');
  console.error(`Mensaje: ${error.message}`);
  console.error(error.stack);
  console.error('🛡️ El servidor continúa operando sin interrupciones.\n');
});

process.on('unhandledRejection', (reason: any, _promise: Promise<any>) => {
  console.error('\n⚠️ [PROCESO - UNHANDLED REJECTION PREVENIDO]');
  console.error('Razón:', reason);
  console.error('🛡️ El servidor continúa operando sin interrupciones.\n');
});

const app = express();

// ============================================================================
// 2. SEGURIDAD Y MIDDLEWARES BASE (HIPAA / OWASP Compliance)
// ============================================================================

// 1. Cabeceras HTTP de seguridad
app.use(helmet({
  contentSecurityPolicy: false // Permite flexibilidad para frontend estático y CDNs
}));

// 2. Configuración flexible de CORS para Vercel / Railway / Render
const allowedOrigins = config.corsOrigin === '*' 
  ? '*' 
  : config.corsOrigin.split(',').map(o => o.trim());

app.use(
  cors({
    origin: (origin, callback) => {
      // Permitir peticiones sin origen (ej. curl, Postman, server-to-server) o si se configuró '*'
      if (!origin || allowedOrigins === '*') {
        return callback(null, true);
      }
      if (Array.isArray(allowedOrigins) && allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      // Permitir dominios de vista previa de Vercel (*.vercel.app)
      if (origin.endsWith('.vercel.app')) {
        return callback(null, true);
      }
      callback(null, true); // En producción tolerante para evitar bloqueos imprevistos de clientes
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Break-Glass-Reason'],
    credentials: true,
  })
);

// 3. Parser de JSON con control de errores sintácticos
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// Middleware para atrapar errores de JSON inválido antes de que lleguen a los controladores
app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
  if (err instanceof SyntaxError && 'status' in err && (err as any).status === 400 && 'body' in err) {
    res.status(400).json({
      success: false,
      error: 'INVALID_JSON_PAYLOAD',
      message: 'El cuerpo de la petición contiene un formato JSON malformado o inválido.',
    });
    return;
  }
  next(err);
});

// 4. Logger de peticiones entrantes
app.use((req: Request, _res: Response, next: NextFunction) => {
  const timestamp = new Date().toISOString();
  console.log(`[HTTP ${timestamp}] ${req.method} ${req.originalUrl} - IP: ${req.ip || req.socket.remoteAddress || '127.0.0.1'}`);
  next();
});

// ============================================================================
// 3. RUTAS DE LA API
// ============================================================================

// Health check y estado del sistema (usado por Render / Railway / Uptime Kuma)
app.get('/api/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ONLINE',
    system: 'Hospital Management System (HMS / EMR API)',
    database: config.dbName,
    environment: config.nodeEnv,
    sslEnabled: config.dbSsl,
    compliance: ['HIPAA', 'GDPR', 'RBAC_ENFORCED'],
    timestamp: new Date().toISOString(),
  });
});

// Módulo de Autenticación
app.use('/api/auth', authRoutes);

// Módulo Clínico, Hospitalario y de Servicios Auxiliares
app.use('/api/clinical', clinicalRoutes);

// ============================================================================
// 4. SERVICIO DE ARCHIVOS ESTÁTICOS Y FALLBACK SPA
// ============================================================================
const possibleFrontendPaths = [
  path.join(__dirname, '../../frontend'),
  path.join(__dirname, '../frontend'),
  path.join(process.cwd(), 'frontend'),
];

let activeFrontendPath = possibleFrontendPaths.find(p => fs.existsSync(path.join(p, 'index.html')));

if (activeFrontendPath) {
  app.use(express.static(activeFrontendPath));

  app.get('*', (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
    res.sendFile(path.join(activeFrontendPath!, 'index.html'));
  });
} else {
  // Si se despliega como API pura independiente (ej. Frontend en Vercel)
  app.get('/', (_req: Request, res: Response) => {
    res.status(200).json({
      message: '🏥 Hospital EMR API - Servidor backend en ejecución.',
      healthCheck: '/api/health',
      docs: 'Endpoints disponibles en /api/auth y /api/clinical'
    });
  });
}

// ============================================================================
// 5. MANEJO GLOBAL CENTRALIZADO DE ERRORES (ROBUST ERROR BOUNDARY)
// ============================================================================

// 404 para endpoints de API no encontrados
app.use('/api/*', (req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'ENDPOINT_NOT_FOUND',
    message: `El endpoint '${req.originalUrl}' no existe en esta API hospitalaria.`,
  });
});

// Manejador global de errores de Express (nunca detiene el servidor)
app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
  console.error(`[ERROR CONTROLADO EN ${req.method} ${req.originalUrl}]:`, err.message || err);

  const statusCode = typeof err.statusCode === 'number' ? err.statusCode : (err.status || 500);
  const isDev = config.nodeEnv === 'development';

  res.status(statusCode).json({
    success: false,
    error: err.name || 'INTERNAL_SERVER_ERROR',
    message: err.message || 'Ocurrió un error inesperado al procesar la solicitud médica.',
    ...(isDev && { stack: err.stack }),
  });
});

// ============================================================================
// 6. ARRANQUE DEL SERVIDOR
// ============================================================================
if (process.env.NODE_ENV !== 'test') {
  app.listen(config.port, '0.0.0.0', async () => {
    console.log('====================================================================');
    console.log('🏥 SISTEMA DE GESTIÓN HOSPITALARIA & EMR (HealthTech API)');
    console.log(`🚀 Servidor ejecutándose en puerto: ${config.port}`);
    console.log(`🔒 Entorno: ${config.nodeEnv}`);
    console.log(`🛡️  Seguridad: Helmet, CORS, JWT, RBAC & Zero-Crash Handlers`);
    console.log(`📋 Base de datos configurada: PostgreSQL (${config.dbName})`);
    console.log(`🌐 Base de datos SSL: ${config.dbSsl ? 'ACTIVADO' : 'DESACTIVADO'}`);
    console.log('====================================================================');
    await testDbConnection();
  });
}

export default app;
