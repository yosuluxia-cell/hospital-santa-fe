# Sistema de Gestión Hospitalaria Web & EMR (Hospital Management System)

Un sistema clínico, hospitalario y de historia clínica electrónica (EHR/EMR) diseñado con arquitectura de grado empresarial, control de accesos basado en roles (**RBAC**), trazabilidad inmutable (**Audit Trail**) y estrictas normas de ética y privacidad médica (**HIPAA / GDPR**).

---

## 1. Arquitectura de Base de Datos (PostgreSQL)

El esquema relacional completo se encuentra codificado en [`backend/src/database/schema.sql`](file:///C:/Users/DELL/.gemini/antigravity/scratch/hospital-emr-system/backend/src/database/schema.sql).

### Principales Módulos y Entidades:
1. **Identidad y Accesos**:
   - `users`: Cuentas, credenciales cifradas con bcrypt/Argon2, roles (`user_role`), bloqueo por intentos fallidos y soporte MFA.
   - `medical_staff`: Perfil clínico vinculado a un usuario (matrícula médica, departamento, especialidad).
   - `patients`: Expediente demográfico y clínico basal (cédula, tipo de sangre, alergias críticas, antecedentes). Separación clara entre datos administrativos (PII) y clínicos (PHI).
2. **Estructura Hospitalaria y Camas**:
   - `departments`: Urgencias, Consultas Externas, UCI, Hospitalización, Laboratorio, Farmacia, etc.
   - `specialties`: Cardiología, Pediatría, Traumatología, etc.
   - `beds` & `bed_assignments`: Gestión de camas por sala, control de ocupación, aislamiento y traslados.
3. **Atención Médica y Urgencias**:
   - `triage_records`: Triaje de Urgencias (Sistema Manchester / Clasificación por 5 colores de severidad: Rojo a Azul, toma de signos vitales, escala Glasgow).
   - `appointments`: Citas programadas, presenciales o telemedicina con enlace seguro.
   - `medical_consultations`: Encuentro clínico (Anamnesis, Examen Físico, Evolución y `doctor_private_notes` para notas médicas confidenciales).
   - `diagnoses`: Diagnósticos codificados en **CIE-10 / CIE-11** (presuntivo, confirmado, diferencial).
4. **Servicios Auxiliares**:
   - `prescriptions` & `prescription_items`: Receta médica electrónica con dosis, posología y control de caducidad.
   - `pharmacy_items` & `medication_dispensations`: Kardex de farmacia hospitalaria, lotes, stock mínimo y registro de dispensación por farmacéutico.
   - `lab_imaging_orders` & `lab_imaging_results`: Solicitud de análisis e imágenes diagnósticas, carga de resultados numéricos/JSON, valores de referencia y verificación de integridad criptográfica (SHA-256) de adjuntos.
5. **Administración y Auditoría Inmutable**:
   - `invoices`: Facturación de consultas, copagos y seguros.
   - `audit_logs`: Registro inmutable de cada lectura o mutación sobre datos médicos protegidos (quién, cuándo, desde qué IP, qué paciente fue consultado y si se activó el protocolo Break-Glass).

---

## 2. Matriz de Roles y Reglas Éticas (RBAC)

| Rol | Consultar Citas / Agenda | Historia Clínica (EHR) | Ver Notas Privadas del Médico | Diagnosticar / Recetar | Laboratorio / Imagen | Dispensar Farmacia | Alta / Caja | Audit Logs |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **PATIENT** | Solo propias | Solo público propio | ❌ **PROHIBIDO** | ❌ No | Solo ver sus resultados | ❌ No | Ver sus pagos | ❌ No |
| **DOCTOR** | Su agenda diaria | Lectura/Escritura asignados | ✅ **PERMITIDO** | ✅ Sí | Solicita exámenes | ❌ No | ❌ No | ❌ No |
| **NURSE** | Pacientes del servicio | Signos vitales / Triaje | ❌ No | ❌ No | Consulta resultados | ❌ No | ❌ No | ❌ No |
| **LAB_TECH / RADIO**| Solo órdenes del área | ❌ No | ❌ No | ❌ No | ✅ Sube resultados/archivos | ❌ No | ❌ No | ❌ No |
| **PHARMACIST** | ❌ No | ❌ No | ❌ No | ❌ No | ❌ No | ✅ Valida y despacha | ❌ No | ❌ No |
| **RECEPTIONIST** | Todas las agendas | ❌ No | ❌ No | ❌ No | ❌ No | ❌ No | ✅ Sí | ❌ No |
| **ADMIN / TI** | Monitoreo | ❌ No (Solo Break-Glass) | ❌ No | ❌ No | ❌ No | ❌ No | Gestión gral | ✅ Audit Logs |

---

## 3. Pila Tecnológica (Stack Recomendado)

- **Backend**:
  - Runtime: **Node.js (LTS)** con **TypeScript**.
  - Framework: **Express.js** estructurado en capas limpias (Controladores, Servicios, Middleware, Repositorios).
  - Seguridad: **Helmet** (Cabeceras OWASP), **CORS** estricto, **Bcrypt** para hashing salteado de contraseñas, **JWT** (Access Token 15 min + Refresh Token).
  - Base de Datos: **PostgreSQL 16+** con extensiones `uuid-ossp` y `pgcrypto`.
- **Frontend**:
  - Framework: **Next.js 14+** (App Router) o **React + Vite** con TypeScript.
  - UI & Estilos: **TailwindCSS** + **Shadcn UI** / **Lucide React**.
  - Estado del Servidor: **TanStack React Query** (caché inteligente y revalidación segura).

---

## 4. Ejecución del Backend

Para poner en marcha el servidor de pruebas con las rutas protegidas y RBAC:

```bash
cd backend
npm install
npm run dev
```

Para correr la suite de verificación automatizada de roles y ética HIPAA:
```bash
npx tsx src/test-rbac-suite.ts
```
