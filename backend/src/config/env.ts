import dotenv from 'dotenv';
dotenv.config();

// Detección automática de SSL para proveedores PostgreSQL en la nube (Neon, Supabase, Railway, Render)
const rawDbUrl = process.env.DATABASE_URL || '';
const isCloudDb = rawDbUrl.includes('neon.tech') || 
                  rawDbUrl.includes('supabase.co') || 
                  rawDbUrl.includes('railway.app') || 
                  rawDbUrl.includes('render.com') ||
                  rawDbUrl.includes('sslmode=require');

const dbSsl = process.env.DB_SSL === 'true' || 
              (process.env.DB_SSL !== 'false' && (process.env.NODE_ENV === 'production' || isCloudDb));

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'healthtech_emr_default_jwt_secret_dev_only_change_in_prod',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '15m',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'healthtech_emr_refresh_secret_key_default',
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  
  // Orígenes CORS permitidos (separados por coma o wildcard '*')
  corsOrigin: process.env.CORS_ORIGIN || '*',

  // Conexión PostgreSQL (hospital_db)
  dbHost: process.env.DB_HOST || 'localhost',
  dbPort: parseInt(process.env.DB_PORT || '5432', 10),
  dbUser: process.env.DB_USER || 'postgres',
  dbPassword: process.env.DB_PASSWORD || 'postgres',
  dbName: process.env.DB_NAME || 'hospital_db',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/hospital_db',
  dbSsl: dbSsl
};
