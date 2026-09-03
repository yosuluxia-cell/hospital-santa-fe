# Hospital de Santa Fe (Distrito Santa Fe)
## Hospital Municipal Ichilo de San Carlos - Municipio de San Carlos
### Sistema de Gestión Hospitalaria & Historia Clínica Electrónica (EMR / EHR)

Sistema clínico hospitalario de atención médica integral y gestión de expedientes digitales con control de acceso basado en roles (**RBAC**), trazabilidad inmutable (**Auditoría HIPAA**) y base de datos **PostgreSQL en la Nube (Supabase)**.

---

## 🏥 Características Principales

1. **Portal Público y Reserva de Citas**:
   - Cabecera minimalista con acceso diferenciado para pacientes y personal facultativo.
   - Directorio de médicos y agendamiento de citas presenciales o telemedicina.
2. **Portal del Paciente (MiSalud)**:
   - Acceso ágil y seguro mediante **Cédula de Identidad (CI)** (ej. `CI-4589214`).
   - Consulta de citas médicas, recetas electrónicas oficiales y evolución clínica.
   - **Aislamiento Ético HIPAA**: Las notas médicas confidenciales son purgadas por el servidor para proteger el criterio del facultativo.
3. **Panel Clínico del Médico (EHR)**:
   - Agenda diaria en tiempo real conectada a Supabase.
   - Diagnósticos codificados en **CIE-10 / CIE-11** y emisión de recetas.
   - Alerta visible de alergias críticas y notas privadas facultativas.
4. **Módulo de Enfermería y Triaje Manchester**:
   - Registro de constantes vitales (PA, FC, Temp, SpO2) y clasificación por severidad (Nivel 1 Rojo a Nivel 5 Azul).
5. **Auditoría HIPAA y Administración TI**:
   - Registro inmutable de eventos de acceso (`auditoria_accesos`) en Supabase.

---

## 🚀 Despliegue en la Nube

### Variables de Entorno Requeridas en Vercel / Render:

```env
DATABASE_URL=postgresql://postgres:ClinicaHospital2026!@db.eoxolslmxbeufwimswhm.supabase.co:5432/postgres
DB_SSL=true
NODE_ENV=production
JWT_SECRET=super_secret_healthtech_emr_jwt_key_2026_hipaa!
JWT_REFRESH_SECRET=refresh_secret_key_rotation_token_998877!
CORS_ORIGIN=*
PORT=5000
```

### Comandos de Ejecución Local:

```bash
# Iniciar backend
cd backend
npm install
npm run build
npm run start

# Frontend servido en http://localhost:5000
```

---

## 👥 Credenciales de Prueba en Supabase:

| Rol | Identificador / Cédula | Contraseña | Destino |
| :--- | :--- | :--- | :--- |
| **Paciente** | `CI-4589214` (Juan Pérez) | *(Solo CI)* | Portal MiSalud |
| **Médico** | `dr.mendoza@hospital.com` | `ClinicaSegura2026!` | Panel Clínico EHR |
| **Enfermería** | `enfermera.elena@hospital.com` | `ClinicaSegura2026!` | Triaje Manchester |
| **Administrador** | `admin@hospital.com` | `ClinicaSegura2026!` | Auditoría HIPAA |

---

© 2026 Hospital de Santa Fe (Distrito Santa Fe) • Hospital Municipal Ichilo de San Carlos.
