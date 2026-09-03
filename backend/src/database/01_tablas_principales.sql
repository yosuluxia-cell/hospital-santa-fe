-- ==============================================================================
-- SISTEMA DE GESTIÓN HOSPITALARIA & HISTORIA CLÍNICA ELECTRÓNICA (HMS / EMR)
-- Script 01: Creación de Tablas Principales
-- Base de Datos: hospital_db (PostgreSQL)
-- ==============================================================================

-- 1. Habilitar extensión para identificadores UUID y funciones criptográficas
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 2. TABLA: ROLES DEL SISTEMA (RBAC)
-- ==============================================================================
DROP TABLE IF EXISTS auditoria_accesos CASCADE;
DROP TABLE IF EXISTS recetas_items CASCADE;
DROP TABLE IF EXISTS recetas CASCADE;
DROP TABLE IF EXISTS diagnosticos_cie CASCADE;
DROP TABLE IF EXISTS registros_medicos CASCADE;
DROP TABLE IF EXISTS citas CASCADE;
DROP TABLE IF EXISTS pacientes CASCADE;
DROP TABLE IF EXISTS medicos CASCADE;
DROP TABLE IF EXISTS usuarios CASCADE;
DROP TABLE IF EXISTS roles CASCADE;

CREATE TABLE roles (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(50) UNIQUE NOT NULL,      -- 'ADMIN', 'DOCTOR', 'ENFERMERO', 'PACIENTE', 'FARMACEUTICO', 'LAB_TECNICO', 'RECEPCIONISTA'
    descripcion TEXT,
    activo BOOLEAN DEFAULT TRUE,
    fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE roles IS 'Roles disponibles en el hospital para el control de acceso (RBAC).';

-- ==============================================================================
-- 3. TABLA: USUARIOS (Credenciales y Seguridad)
-- ==============================================================================
CREATE TABLE usuarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_rol INT NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
    email VARCHAR(150) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    apellido VARCHAR(100) NOT NULL,
    telefono VARCHAR(30),
    activo BOOLEAN DEFAULT TRUE,
    intentos_fallidos INT DEFAULT 0,
    bloqueado_hasta TIMESTAMP WITH TIME ZONE,
    ultimo_login TIMESTAMP WITH TIME ZONE,
    fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    fecha_actualizacion TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_usuarios_email ON usuarios(email);
CREATE INDEX idx_usuarios_rol ON usuarios(id_rol);

COMMENT ON TABLE usuarios IS 'Cuentas de usuario centralizadas para personal médico, pacientes y administradores.';

-- ==============================================================================
-- 4. TABLA: MÉDICOS Y PERSONAL DE SALUD
-- ==============================================================================
CREATE TABLE medicos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_usuario UUID UNIQUE NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    matricula_profesional VARCHAR(50) UNIQUE NOT NULL, -- Cédula o licencia médica
    especialidad VARCHAR(100) NOT NULL,                -- Cardiología, Pediatría, Medicina General, etc.
    departamento VARCHAR(100) NOT NULL,                -- Consultas Externas, Urgencias, UCI, Cirugía
    firma_digital_hash VARCHAR(255),
    activo BOOLEAN DEFAULT TRUE,
    fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_medicos_matricula ON medicos(matricula_profesional);
CREATE INDEX idx_medicos_especialidad ON medicos(especialidad);

COMMENT ON TABLE medicos IS 'Datos del personal facultativo y especialidad médica.';

-- ==============================================================================
-- 5. TABLA: PACIENTES (Expediente Clínico y Datos Demográficos)
-- ==============================================================================
CREATE TABLE pacientes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_usuario UUID UNIQUE REFERENCES usuarios(id) ON DELETE SET NULL, -- Vínculo opcional si el paciente tiene cuenta web
    documento_identidad VARCHAR(50) UNIQUE NOT NULL,                   -- DNI, Cédula o Pasaporte
    nombre VARCHAR(100) NOT NULL,
    apellido VARCHAR(100) NOT NULL,
    fecha_nacimiento DATE NOT NULL,
    genero VARCHAR(20) NOT NULL,                                       -- 'Masculino', 'Femenino', 'Otro'
    tipo_sangre VARCHAR(10),                                          -- 'O+', 'O-', 'A+', 'B+', etc.
    alergias TEXT,                                                     -- Alergias a medicamentos (ej. Penicilina)
    antecedentes_medicos TEXT,                                         -- Hipertensión, Diabetes, etc.
    telefono VARCHAR(30),
    direccion TEXT,
    ciudad VARCHAR(100),
    contacto_emergencia_nombre VARCHAR(150),
    contacto_emergencia_telefono VARCHAR(30),
    seguro_medico VARCHAR(100),                                        -- Compañía aseguradora
    numero_poliza VARCHAR(80),
    fecha_registro TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    fecha_actualizacion TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_pacientes_documento ON pacientes(documento_identidad);
CREATE INDEX idx_pacientes_usuario ON pacientes(id_usuario);

COMMENT ON TABLE pacientes IS 'Datos demográficos y basales del paciente (PII + PHI inicial).';

-- ==============================================================================
-- 6. TABLA: CITAS MÉDICAS (Presencial / Telemedicina)
-- ==============================================================================
CREATE TABLE citas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_paciente UUID NOT NULL REFERENCES pacientes(id) ON DELETE RESTRICT,
    id_medico UUID NOT NULL REFERENCES medicos(id) ON DELETE RESTRICT,
    fecha_hora TIMESTAMP WITH TIME ZONE NOT NULL,
    modalidad VARCHAR(30) NOT NULL DEFAULT 'PRESENCIAL' CHECK (modalidad IN ('PRESENCIAL', 'TELEMEDICINA')),
    estado VARCHAR(30) NOT NULL DEFAULT 'PROGRAMADA' CHECK (estado IN ('PROGRAMADA', 'CONFIRMADA', 'EN_ATENCION', 'ATENDIDA', 'CANCELADA', 'NO_ASISTIO')),
    motivo TEXT,
    enlace_telemedicina VARCHAR(255),                                  -- URL de videollamada cifrada WebRTC
    creado_por UUID REFERENCES usuarios(id),
    fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    fecha_actualizacion TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_citas_paciente_fecha ON citas(id_paciente, fecha_hora);
CREATE INDEX idx_citas_medico_fecha ON citas(id_medico, fecha_hora);
CREATE INDEX idx_citas_estado ON citas(estado);

COMMENT ON TABLE citas IS 'Programación, control y estados de consultas médicas.';

-- ==============================================================================
-- 7. TABLA: REGISTROS MÉDICOS / HISTORIA CLÍNICA ELECTRÓNICA (EHR)
-- ==============================================================================
CREATE TABLE registros_medicos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_cita UUID UNIQUE REFERENCES citas(id) ON DELETE SET NULL,
    id_paciente UUID NOT NULL REFERENCES pacientes(id) ON DELETE RESTRICT,
    id_medico UUID NOT NULL REFERENCES medicos(id) ON DELETE RESTRICT,
    
    -- Anamnesis y Hallazgos Clínicos
    motivo_consulta TEXT NOT NULL,                                     -- Lo que el paciente refiere
    examen_fisico TEXT,                                                -- Signos, auscultación, palpación
    evolucion_clinica TEXT NOT NULL,                                   -- Diagnóstico clínico y conducta médica
    
    -- RESTRICCIÓN ÉTICA Y DE CONFIDENCIALIDAD:
    -- Las notas privadas del doctor NUNCA deben mostrarse al paciente en su portal.
    notas_privadas_doctor TEXT,
    
    fecha_consulta TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    fecha_actualizacion TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_registros_paciente ON registros_medicos(id_paciente, fecha_consulta DESC);
CREATE INDEX idx_registros_medico ON registros_medicos(id_medico);

COMMENT ON TABLE registros_medicos IS 'Expediente clínico electrónico (EHR). Contiene la evolución clínica y notas confidenciales.';

-- ==============================================================================
-- 8. TABLA: DIAGNÓSTICOS CODIFICADOS (CIE-10 / CIE-11)
-- ==============================================================================
CREATE TABLE diagnosticos_cie (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_registro_medico UUID NOT NULL REFERENCES registros_medicos(id) ON DELETE CASCADE,
    codigo_cie10 VARCHAR(20) NOT NULL,                                 -- Ej: 'I20.9', 'E11.9', 'J00'
    descripcion TEXT NOT NULL,
    tipo VARCHAR(30) NOT NULL DEFAULT 'CONFIRMADO' CHECK (tipo IN ('CONFIRMADO', 'PRESUNTIVO', 'DIFERENCIAL')),
    es_principal BOOLEAN DEFAULT TRUE,
    fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_diagnosticos_registro ON diagnosticos_cie(id_registro_medico);
CREATE INDEX idx_diagnosticos_codigo ON diagnosticos_cie(codigo_cie10);

-- ==============================================================================
-- 9. TABLAS: RECETAS MÉDICAS Y FARMACOTERAPIA
-- ==============================================================================
CREATE TABLE recetas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_registro_medico UUID NOT NULL REFERENCES registros_medicos(id) ON DELETE CASCADE,
    id_paciente UUID NOT NULL REFERENCES pacientes(id) ON DELETE RESTRICT,
    id_medico UUID NOT NULL REFERENCES medicos(id) ON DELETE RESTRICT,
    fecha_emision TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    fecha_vencimiento DATE NOT NULL,
    estado VARCHAR(30) DEFAULT 'ACTIVA' CHECK (estado IN ('ACTIVA', 'DISPENSADA_PARCIAL', 'DISPENSADA_TOTAL', 'ANULADA', 'VENCIDA')),
    indicaciones_generales TEXT,
    fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE recetas_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_receta UUID NOT NULL REFERENCES recetas(id) ON DELETE CASCADE,
    medicamento VARCHAR(150) NOT NULL,                                 -- Nombre genérico / comercial
    dosis VARCHAR(100) NOT NULL,                                       -- '500 mg', '1 comprimido'
    frecuencia VARCHAR(100) NOT NULL,                                  -- 'Cada 8 horas'
    duracion_dias INT NOT NULL,                                        -- Ej: 7 días
    cantidad_recetada INT NOT NULL CHECK (cantidad_recetada > 0),
    cantidad_dispensada INT DEFAULT 0 CHECK (cantidad_dispensada >= 0),
    instrucciones_especificas TEXT
);

CREATE INDEX idx_recetas_paciente ON recetas(id_paciente, estado);

-- ==============================================================================
-- 10. TABLA: AUDITORÍA INMUTABLE DE ACCESOS (HIPAA / GDPR Audit Trail)
-- ==============================================================================
CREATE TABLE auditoria_accesos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_usuario UUID REFERENCES usuarios(id) ON DELETE SET NULL,
    email_usuario VARCHAR(150),
    rol_usuario VARCHAR(50) NOT NULL,
    accion VARCHAR(50) NOT NULL,                                       -- 'LOGIN_SUCCESS', 'READ_PHI', 'CREATE', 'UPDATE', 'BREAK_GLASS'
    recurso VARCHAR(100) NOT NULL,                                     -- 'REGISTROS_MEDICOS', 'PACIENTES', etc.
    id_recurso VARCHAR(100),
    id_paciente UUID REFERENCES pacientes(id) ON DELETE SET NULL,
    ip_origen VARCHAR(45) NOT NULL,
    user_agent TEXT,
    detalles JSONB,
    fecha_evento TIMESTAMP WITH TIME ZONE DEFAULT NOW()                -- Registro con estampa de tiempo inmutable
);

CREATE INDEX idx_auditoria_paciente ON auditoria_accesos(id_paciente, fecha_evento DESC);
CREATE INDEX idx_auditoria_usuario ON auditoria_accesos(id_usuario, fecha_evento DESC);

COMMENT ON TABLE auditoria_accesos IS 'Registro inmutable de trazabilidad de todos los accesos a datos médicos sensibles (PHI).';
