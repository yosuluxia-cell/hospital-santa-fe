-- ============================================================================
-- SISTEMA DE GESTIÓN HOSPITALARIA & HISTORIA CLÍNICA ELECTRÓNICA (HMS / EMR)
-- Esquema de Base de Datos PostgreSQL - Grado Empresarial (HealthTech)
-- Cumplimiento: HIPAA, GDPR, RBAC, Trazabilidad Inmutable (Audit Trail)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- TIPOS ENUMERADOS
-- ============================================================================

CREATE TYPE user_role AS ENUM (
    'ADMIN',          -- Administrador / TI
    'DOCTOR',         -- Médico General / Especialista / Cirujano
    'NURSE',          -- Enfermero / Triaje
    'LAB_TECH',       -- Técnico de Laboratorio Clínico
    'RADIOLOGIST',    -- Técnico / Médico de Imagenología
    'PHARMACIST',     -- Farmacia Hospitalaria
    'RECEPTIONIST',   -- Recepción, Admisión y Caja
    'PATIENT'         -- Paciente (Portal de Salud)
);

CREATE TYPE appointment_type AS ENUM (
    'IN_PERSON',      -- Presencial
    'TELEMEDICINE'    -- Telemedicina (Videoconsulta segura)
);

CREATE TYPE appointment_status AS ENUM (
    'SCHEDULED',      -- Agendada
    'CONFIRMED',      -- Confirmada por el paciente/recepción
    'IN_PROGRESS',    -- En atención médica
    'COMPLETED',      -- Finalizada
    'CANCELLED',      -- Cancelada
    'NO_SHOW'         -- Paciente no se presentó
);

CREATE TYPE triage_level AS ENUM (
    'LEVEL_1_RED',    -- Reanimación / Emergencia vital inmediata (< 0 min)
    'LEVEL_2_ORANGE', -- Emergencia / Riesgo vital potencial (< 10-15 min)
    'LEVEL_3_YELLOW', -- Urgencia / Condición estable pero requiere atención (< 60 min)
    'LEVEL_4_GREEN',  -- Menor urgencia / Padecimiento común (< 120 min)
    'LEVEL_5_BLUE'    -- No urgente / Administrativo o control (< 240 min)
);

CREATE TYPE bed_status AS ENUM (
    'AVAILABLE',      -- Disponible
    'OCCUPIED',       -- Ocupada
    'CLEANING',       -- Limpieza y desinfección
    'MAINTENANCE',    -- En mantenimiento
    'ISOLATION'       -- Aislamiento estricto
);

CREATE TYPE order_service_type AS ENUM (
    'LABORATORY',     -- Laboratorio Clínico (Bioquímica, Hemato, etc.)
    'IMAGING'         -- Rayos X, Ecografía, Tomografía, Resonancia
);

CREATE TYPE order_priority AS ENUM (
    'ROUTINE',        -- Rutina
    'URGENT',         -- Urgente
    'STAT'            -- Prioridad Inmediata / UCI / Choque
);

CREATE TYPE order_status AS ENUM (
    'REQUESTED',         -- Solicitado por el médico
    'SAMPLE_COLLECTED', -- Muestra tomada / Paciente en sala
    'IN_ANALYSIS',       -- En proceso de análisis
    'RESULT_AVAILABLE',  -- Resultado publicado y validado
    'CANCELLED'          -- Anulado
);

CREATE TYPE prescription_status AS ENUM (
    'ACTIVE',               -- Activa
    'PARTIALLY_DISPENSED',  -- Dispensada parcialmente
    'FULLY_DISPENSED',      -- Dispensada totalmente
    'CANCELLED',            -- Anulada
    'EXPIRED'               -- Vencida
);

CREATE TYPE diagnosis_type AS ENUM (
    'PRESUMPTIVE',    -- Presuntivo
    'CONFIRMED',      -- Confirmado
    'DIFFERENTIAL'    -- Diagnóstico diferencial
);

CREATE TYPE payment_status AS ENUM (
    'PENDING',        -- Pendiente
    'PAID',           -- Pagado
    'REFUNDED',       -- Reembolsado
    'CANCELLED'       -- Cancelado
);

CREATE TYPE audit_action AS ENUM (
    'LOGIN_SUCCESS',
    'LOGIN_FAILED',
    'LOGOUT',
    'CREATE',
    'READ_PHI',          -- Lectura de Protected Health Information (Sensible)
    'UPDATE',
    'DELETE',
    'EXPORT_PDF',
    'DISPENSE_MEDICATION',
    'BREAK_GLASS_ACCESS' -- Acceso de emergencia médica extraordinaria
);

-- ============================================================================
-- 1. ESTRUCTURA HOSPITALARIA (Departamentos, Especialidades, Camas)
-- ============================================================================

CREATE TABLE departments (
    id SERIAL PRIMARY KEY,
    code VARCHAR(30) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE specialties (
    id SERIAL PRIMARY KEY,
    code VARCHAR(30) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE beds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    department_id INT NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
    room_number VARCHAR(20) NOT NULL,
    bed_number VARCHAR(20) NOT NULL,
    bed_type VARCHAR(50) DEFAULT 'GENERAL', -- GENERAL, UCI, PEDIATRICA, QUIRÓFANO
    status bed_status DEFAULT 'AVAILABLE',
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_room_bed UNIQUE(room_number, bed_number)
);

-- ============================================================================
-- 2. IDENTIDAD Y CONTROL DE ACCESO (Usuarios, Pacientes, Personal Médico)
-- ============================================================================

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(180) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role user_role NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone VARCHAR(30),
    is_active BOOLEAN DEFAULT TRUE,
    mfa_enabled BOOLEAN DEFAULT FALSE,
    mfa_secret VARCHAR(128),
    failed_login_attempts INT DEFAULT 0,
    locked_until TIMESTAMP WITH TIME ZONE,
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Separación de datos clínicos y personales del paciente (PII + PHI)
CREATE TABLE patients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE REFERENCES users(id) ON DELETE SET NULL, -- Vínculo opcional si el paciente tiene cuenta web
    national_id VARCHAR(50) UNIQUE NOT NULL,                    -- Cédula, DNI o Pasaporte
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    date_of_birth DATE NOT NULL,
    gender VARCHAR(20) NOT NULL,                                -- Masculino, Femenino, Otro
    blood_type VARCHAR(10),                                     -- O+, O-, A+, B+, etc.
    critical_allergies TEXT,                                    -- Alergias graves (ej. Penicilina)
    chronic_conditions TEXT,                                    -- Hipertensión, Diabetes, etc.
    emergency_contact_name VARCHAR(150),
    emergency_contact_phone VARCHAR(30),
    address TEXT,
    city VARCHAR(100),
    insurance_provider VARCHAR(100),
    insurance_policy_number VARCHAR(80),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE medical_staff (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    license_number VARCHAR(80) UNIQUE NOT NULL,                 -- Matrícula / Cédula Profesional
    department_id INT REFERENCES departments(id) ON DELETE RESTRICT,
    specialty_id INT REFERENCES specialties(id) ON DELETE SET NULL,
    staff_type VARCHAR(30) NOT NULL,                            -- 'DOCTOR', 'NURSE', 'SURGEON', etc.
    digital_signature_hash VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- 3. GESTIÓN CLÍNICA (Triaje, Citas, Consultas, Diagnósticos CIE)
-- ============================================================================

CREATE TABLE triage_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
    nurse_id UUID NOT NULL REFERENCES medical_staff(id) ON DELETE RESTRICT,
    level triage_level NOT NULL,
    systolic_bp INT,                                            -- Presión arterial sistólica (mmHg)
    diastolic_bp INT,                                           -- Presión arterial diastólica (mmHg)
    heart_rate INT,                                             -- Frecuencia cardíaca (lpm)
    respiratory_rate INT,                                       -- Frecuencia respiratoria (rpm)
    oxygen_saturation NUMERIC(4,1),                             -- SpO2 (%)
    temperature NUMERIC(4,1),                                   -- Temperatura (°C)
    blood_glucose NUMERIC(5,1),                                 -- Glucemia (mg/dL)
    glasgow_scale INT CHECK (glasgow_scale BETWEEN 3 AND 15),
    chief_complaint TEXT NOT NULL,                              -- Motivo de urgencia
    triage_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE appointments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
    doctor_id UUID NOT NULL REFERENCES medical_staff(id) ON DELETE RESTRICT,
    department_id INT NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
    appointment_date TIMESTAMP WITH TIME ZONE NOT NULL,
    appointment_type appointment_type DEFAULT 'IN_PERSON',
    status appointment_status DEFAULT 'SCHEDULED',
    reason TEXT,
    telemedicine_meeting_url VARCHAR(255),                      -- Enlace seguro si es telemedicina
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Expediente Clínico Electrónico (EHR): Encapsula la consulta médica
CREATE TABLE medical_consultations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    appointment_id UUID UNIQUE REFERENCES appointments(id) ON DELETE SET NULL,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
    doctor_id UUID NOT NULL REFERENCES medical_staff(id) ON DELETE RESTRICT,
    triage_id UUID REFERENCES triage_records(id) ON DELETE SET NULL,
    
    -- Anamnesis y Evaluación
    subjective_symptoms TEXT NOT NULL,                          -- Motivo de consulta y síntomas
    objective_physical_exam TEXT,                               -- Hallazgos del examen físico
    clinical_evolution TEXT,                                    -- Juicio clínico y plan de tratamiento
    
    -- RESTRICCIÓN ÉTICA Y DE PRIVACIDAD:
    -- Notas privadas/confidenciales del médico. NUNCA se retornan en las vistas del portal del paciente.
    doctor_private_notes TEXT,
    
    is_confidential BOOLEAN DEFAULT FALSE,                      -- Para casos de alta sensibilidad
    consultation_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE diagnoses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    consultation_id UUID NOT NULL REFERENCES medical_consultations(id) ON DELETE CASCADE,
    icd_code VARCHAR(20) NOT NULL,                              -- Código CIE-10 o CIE-11 (ej: 'I10', 'E11.9')
    description TEXT NOT NULL,
    diagnosis_type diagnosis_type DEFAULT 'CONFIRMED',
    is_primary BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Hospitalización: Asignación de Camas
CREATE TABLE bed_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bed_id UUID NOT NULL REFERENCES beds(id) ON DELETE RESTRICT,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
    admitted_by UUID NOT NULL REFERENCES medical_staff(id) ON DELETE RESTRICT,
    admission_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    discharge_date TIMESTAMP WITH TIME ZONE,
    admission_reason TEXT,
    discharge_summary TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- 4. SERVICIOS AUXILIARES (Laboratorio, Radiología, Farmacia Hospitalaria)
-- ============================================================================

-- Órdenes de Exámenes (Laboratorio e Imagenología)
CREATE TABLE lab_imaging_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    consultation_id UUID REFERENCES medical_consultations(id) ON DELETE SET NULL,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
    requesting_doctor_id UUID NOT NULL REFERENCES medical_staff(id) ON DELETE RESTRICT,
    service_type order_service_type NOT NULL,
    exam_name VARCHAR(180) NOT NULL,                            -- Ej: 'Hemograma Completo', 'Tomografía Axial Tórax'
    clinical_indication TEXT,
    priority order_priority DEFAULT 'ROUTINE',
    status order_status DEFAULT 'REQUESTED',
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Resultados cargados por Técnicos / Especialistas de Laboratorio/Imagen
CREATE TABLE lab_imaging_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID UNIQUE NOT NULL REFERENCES lab_imaging_orders(id) ON DELETE CASCADE,
    technician_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    interpreting_doctor_id UUID REFERENCES medical_staff(id) ON DELETE SET NULL,
    findings_summary TEXT NOT NULL,                             -- Interpretación textual
    quantitative_data JSONB,                                    -- Valores numéricos: {"glucosa": 95, "leucocitos": 7200}
    reference_ranges TEXT,                                      -- Valores de referencia normales
    attachment_url VARCHAR(255),                                -- Enlace a archivo digital (PDF o DICOM/Imagen en storage seguro)
    file_hash_sha256 VARCHAR(64),                               -- Integridad criptográfica del archivo adjunto
    completed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Inventario de Farmacia Hospitalaria
CREATE TABLE pharmacy_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL,
    commercial_name VARCHAR(150) NOT NULL,
    generic_name VARCHAR(150) NOT NULL,
    dosage_form VARCHAR(50) NOT NULL,                           -- Tabletas, Ampollas, Jarabe, etc.
    concentration VARCHAR(50) NOT NULL,                         -- Ej: 500 mg, 10 mg/ml
    current_stock INT NOT NULL DEFAULT 0 CHECK (current_stock >= 0),
    min_stock_alert INT NOT NULL DEFAULT 20,
    batch_number VARCHAR(50) NOT NULL,
    expiration_date DATE NOT NULL,
    unit_price NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    is_controlled_substance BOOLEAN DEFAULT FALSE,              -- Estupefacientes con receta retenida
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Recetas Médicas Electrónicas
CREATE TABLE prescriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    consultation_id UUID NOT NULL REFERENCES medical_consultations(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
    doctor_id UUID NOT NULL REFERENCES medical_staff(id) ON DELETE RESTRICT,
    issue_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expiration_date DATE NOT NULL,
    status prescription_status DEFAULT 'ACTIVE',
    general_instructions TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE prescription_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    prescription_id UUID NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
    pharmacy_item_id UUID REFERENCES pharmacy_items(id) ON DELETE SET NULL,
    medication_name VARCHAR(150) NOT NULL,
    dosage VARCHAR(100) NOT NULL,                               -- Ej: 1 tableta cada 8 horas
    frequency VARCHAR(100) NOT NULL,
    duration_days INT NOT NULL,
    quantity_prescribed INT NOT NULL CHECK (quantity_prescribed > 0),
    quantity_dispensed INT DEFAULT 0 CHECK (quantity_dispensed >= 0),
    special_instructions TEXT
);

-- Validaciones de Dispensación en Farmacia
CREATE TABLE medication_dispensations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    prescription_id UUID NOT NULL REFERENCES prescriptions(id) ON DELETE RESTRICT,
    pharmacist_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    dispensed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    notes TEXT
);

-- ============================================================================
-- 5. ADMINISTRACIÓN, RECEPCIÓN Y FACTURACIÓN
-- ============================================================================

CREATE TABLE invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_number VARCHAR(50) UNIQUE NOT NULL,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
    cashier_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
    subtotal NUMERIC(10,2) NOT NULL,
    tax NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    total NUMERIC(10,2) NOT NULL,
    status payment_status DEFAULT 'PENDING',
    payment_method VARCHAR(50),                                 -- Efectivo, Tarjeta, Seguro Médico, Transferencia
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    paid_at TIMESTAMP WITH TIME ZONE
);

-- ============================================================================
-- 6. AUDITORÍA INMUTABLE & CUMPLIMIENTO HIPAA / GDPR
-- ============================================================================

CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_id UUID REFERENCES users(id) ON DELETE SET NULL,      -- Quién ejecutó la acción
    actor_email VARCHAR(180),
    actor_role VARCHAR(50) NOT NULL,
    action audit_action NOT NULL,
    resource VARCHAR(100) NOT NULL,                             -- Tabla o entidad: 'MEDICAL_CONSULTATION', 'PATIENT_RECORD'
    resource_id VARCHAR(100),                                   -- ID del registro accedido
    patient_id UUID REFERENCES patients(id) ON DELETE SET NULL, -- Paciente afectado por la consulta/modificación
    ip_address VARCHAR(45) NOT NULL,                            -- Soporta IPv4 e IPv6
    user_agent TEXT,
    details JSONB,                                              -- Contexto adicional o campos modificados (sin almacenar contraseñas)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()           -- Timestamp inmutable
);

-- ============================================================================
-- ÍNDICES DE ALTO RENDIMIENTO Y CONSULTAS FRECUENTES
-- ============================================================================

CREATE INDEX idx_audit_patient_time ON audit_logs (patient_id, created_at DESC);
CREATE INDEX idx_audit_actor_time ON audit_logs (actor_id, created_at DESC);
CREATE INDEX idx_patients_national_id ON patients (national_id);
CREATE INDEX idx_patients_user_id ON patients (user_id);
CREATE INDEX idx_appointments_doctor_date ON appointments (doctor_id, appointment_date);
CREATE INDEX idx_appointments_patient_date ON appointments (patient_id, appointment_date);
CREATE INDEX idx_consultations_patient ON medical_consultations (patient_id, consultation_date DESC);
CREATE INDEX idx_orders_patient_status ON lab_imaging_orders (patient_id, status);
CREATE INDEX idx_orders_service_status ON lab_imaging_orders (service_type, status);
CREATE INDEX idx_prescriptions_patient ON prescriptions (patient_id, status);
CREATE INDEX idx_beds_department_status ON beds (department_id, status);
CREATE INDEX idx_pharmacy_stock ON pharmacy_items (current_stock);
