# 🚀 Guía de Despliegue en Producción Real - Sistema Hospitalario & EMR

Esta guía detalla paso a paso cómo desplegar el sistema completo en entornos de producción en la nube:
* **Base de Datos PostgreSQL**: [Neon](https://neon.tech) o [Supabase](https://supabase.com) (Cifrado SSL activo).
* **Backend API (Node.js/Express)**: [Render](https://render.com) o [Railway](https://railway.app).
* **Frontend Web (SMC & EMR)**: [Vercel](https://vercel.com).

---

## 1. Configuración de PostgreSQL en la Nube (Neon o Supabase)

### Opción A: Neon (Recomendado - Serverless PostgreSQL)
1. Crea una cuenta gratuita en [https://neon.tech](https://neon.tech).
2. Crea un nuevo proyecto llamado `hospital-emr`.
3. Copia la cadena de conexión proporcionada en el panel de Neon. Tendrá este formato:
   ```env
   DATABASE_URL=postgresql://neondb_owner:tu_contraseña_aqui@ep-cool-flower-123456.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```

### Opción B: Supabase
1. Crea un proyecto en [https://supabase.com](https://supabase.com).
2. En **Project Settings -> Database**, copia la URL de conexión en **Connection String (URI)**:
   ```env
   DATABASE_URL=postgresql://postgres.tu_id_proyecto:tu_contraseña@aws-0-us-east-1.pooler.supabase.com:6543/postgres
   ```

### Poblar la Base de Datos en la Nube (Tablas + Semillas)
Para crear las 9 tablas hospitalarias e insertar los datos iniciales (CIE-10, médicos, pacientes, roles) en tu base de datos de la nube, ejecuta desde tu terminal local:
```bash
cd backend
DATABASE_URL="tu_url_de_neon_o_supabase" DB_SSL=true npm run db:init
```
¡Listo! La base de datos en la nube quedará 100% inicializada.

---

## 2. Despliegue del Backend (Render o Railway)

### Opción A: Render (https://render.com)
El proyecto incluye el archivo de configuración automática [`render.yaml`](render.yaml).

1. Conecta tu repositorio de GitHub en Render.
2. Selecciona **New -> Blueprint** o **New Web Service**:
   - **Root Directory**: `backend`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm run start`
   - **Health Check Path**: `/api/health`
3. Configura las variables de entorno en el panel de Render:
   | Variable | Valor |
   | :--- | :--- |
   | `NODE_ENV` | `production` |
   | `PORT` | `10000` |
   | `DATABASE_URL` | *(Tu URL copiada de Neon o Supabase)* |
   | `DB_SSL` | `true` |
   | `JWT_SECRET` | *(Cadena aleatoria de 32 caracteres)* |
   | `JWT_REFRESH_SECRET`| *(Cadena aleatoria de 32 caracteres)* |
   | `CORS_ORIGIN` | `*` o la URL de tu frontend en Vercel |

Tu backend estará en vivo en una URL como: `https://hospital-emr-backend.onrender.com`.

---

### Opción B: Railway (https://railway.app)
El proyecto incluye [`railway.json`](railway.json) y [`Procfile`](backend/Procfile).

1. Crea un nuevo proyecto en Railway y selecciona **Deploy from GitHub repo**.
2. En **Variables**, agrega `DATABASE_URL`, `DB_SSL=true`, `JWT_SECRET` y `NODE_ENV=production`.
3. Railway compilará con `npm run build` y ejecutará `npm run start`.

---

## 3. Despliegue del Frontend en Vercel (https://vercel.com)

El proyecto cuenta con [`frontend/vercel.json`](frontend/vercel.json) y [`vercel.json`](vercel.json) configurados con reglas de reescritura SPA y proxying de API.

1. Ingresa a [Vercel](https://vercel.com) y haz clic en **Add New -> Project**.
2. Importa tu repositorio de GitHub.
3. Si configuras el proyecto apuntando al directorio `frontend`:
   - **Root Directory**: `frontend`
   - **Framework Preset**: `Other`
4. En **Environment Variables** (opcional si usas proxying):
   - Puedes configurar `API_BASE_URL` apuntando a tu backend de Render:
     ```env
     API_BASE_URL=https://tu-backend.onrender.com/api
     ```
5. Haz clic en **Deploy**.

---

## 4. Protección Zero-Crash y Manejo Global de Errores

El backend está protegido con un sistema multicapa para evitar caídas:

1. **`process.on('uncaughtException')` & `process.on('unhandledRejection')`**:
   Atrapa cualquier excepción asíncrona o fallo de red en segundo plano evitando que el proceso Node.js se detenga.
2. **Parser JSON Defensivo**:
   Cualquier petición con sintaxis JSON corrupta devuelve `HTTP 400 (INVALID_JSON_PAYLOAD)` sin disparar errores internos `500`.
3. **Manejador Global de Rutas Inexistentes (404)**:
   Peticiones a rutas no definidas devuelven respuestas JSON estructuradas.
4. **Reconexión Automática con PostgreSQL**:
   El pool de `pg` gestiona caídas de red o pausas automáticas de bases de datos serverless (como Neon/Supabase) reconectando sin interrumpir el servicio.
5. **Sanitización HIPAA**:
   En modo `production`, los stack traces internos de la base de datos se ocultan automáticamente del cliente para prevenir fugas de información.
