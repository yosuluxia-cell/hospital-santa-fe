-- ==============================================================================
-- SISTEMA DE GESTIÓN HOSPITALARIA & HISTORIA CLÍNICA ELECTRÓNICA (HMS / EMR)
-- Script 02: Inserción de Datos Iniciales (Semilla / Seed Data)
-- Base de Datos: hospital_db (PostgreSQL)
-- Contraseña de todos los usuarios de prueba: ClinicaSegura2026!
-- ==============================================================================

-- 1. Insertar Roles del Sistema (RBAC)
INSERT INTO roles (nombre, descripcion) VALUES
    ('ADMIN', 'Administrador del sistema y Oficial de Seguridad TI'),
    ('DOCTOR', 'Médico General, Especialista o Cirujano'),
    ('ENFERMERO', 'Personal de Enfermería, Triaje y Cuidados'),
    ('PACIENTE', 'Usuario del Portal de Salud del Paciente'),
    ('FARMACEUTICO', 'Farmacia Hospitalaria y Dispensación'),
    ('LAB_TECNICO', 'Técnico de Laboratorio e Imagenología'),
    ('RECEPCIONISTA', 'Recepción, Admisión de Sala y Facturación')
ON CONFLICT (nombre) DO NOTHING;

-- 2. Insertar Usuarios con contraseñas encriptadas con bcrypt (pgcrypto)
-- Password en texto plano: ClinicaSegura2026!
INSERT INTO usuarios (id, id_rol, email, password_hash, nombre, apellido, telefono, activo) VALUES
    -- Administrador TI
    ('a0000000-0000-0000-0000-000000000001', 
     (SELECT id FROM roles WHERE nombre = 'ADMIN'), 
     'admin@hospital.com', 
     crypt('ClinicaSegura2026!', gen_salt('bf', 10)), 
     'Carlos', 'Valenzuela', '+591 70011223', TRUE),

    -- Médico Especialista (Cardiología)
    ('a0000000-0000-0000-0000-000000000002', 
     (SELECT id FROM roles WHERE nombre = 'DOCTOR'), 
     'dr.mendoza@hospital.com', 
     crypt('ClinicaSegura2026!', gen_salt('bf', 10)), 
     'Alejandro', 'Mendoza', '+591 71122334', TRUE),

    -- Paciente 1: Juan Pérez
    ('a0000000-0000-0000-0000-000000000003', 
     (SELECT id FROM roles WHERE nombre = 'PACIENTE'), 
     'paciente.juan@gmail.com', 
     crypt('ClinicaSegura2026!', gen_salt('bf', 10)), 
     'Juan', 'Pérez', '+591 72233445', TRUE),

    -- Paciente 2: María Gómez
    ('a0000000-0000-0000-0000-000000000004', 
     (SELECT id FROM roles WHERE nombre = 'PACIENTE'), 
     'paciente.maria@gmail.com', 
     crypt('ClinicaSegura2026!', gen_salt('bf', 10)), 
     'María', 'Gómez', '+591 73344556', TRUE)
ON CONFLICT (email) DO NOTHING;

-- 3. Insertar Perfil de Médico
INSERT INTO medicos (id, id_usuario, matricula_profesional, especialidad, departamento) VALUES
    ('b0000000-0000-0000-0000-000000000001',
     'a0000000-0000-0000-0000-000000000002',
     'MED-SCZ-8894',
     'Cardiología',
     'Consultas Externas')
ON CONFLICT (matricula_profesional) DO NOTHING;

-- 4. Insertar Perfiles de Pacientes
INSERT INTO pacientes (id, id_usuario, documento_identidad, nombre, apellido, fecha_nacimiento, genero, tipo_sangre, alergias, antecedentes_medicos, telefono, direccion, ciudad, seguro_medico, numero_poliza) VALUES
    ('c0000000-0000-0000-0000-000000000001',
     'a0000000-0000-0000-0000-000000000003',
     'CI-4589214',
     'Juan', 'Pérez',
     '1985-06-14', 'Masculino', 'O+',
     'Penicilina, Sulfamidas',
     'Hipertensión arterial en tratamiento, Dislipidemia',
     '+591 72233445', 'Av. San Martín 450', 'Santa Cruz',
     'Seguro Salud Total', 'POL-2026-9901'),

    ('c0000000-0000-0000-0000-000000000002',
     'a0000000-0000-0000-0000-000000000004',
     'CI-7812903',
     'María', 'Gómez',
     '1992-11-28', 'Femenino', 'A+',
     'Ninguna conocida',
     'Rinitis alérgica estacional',
     '+591 73344556', 'Calle Beni 123', 'Santa Cruz',
     'Particular / Sin seguro', NULL)
ON CONFLICT (documento_identidad) DO NOTHING;

-- 5. Insertar Cita Médica de Ejemplo (Presencial)
INSERT INTO citas (id, id_paciente, id_medico, fecha_hora, modalidad, estado, motivo, creado_por) VALUES
    ('d0000000-0000-0000-0000-000000000001',
     'c0000000-0000-0000-0000-000000000001',
     'b0000000-0000-0000-0000-000000000001',
     NOW() + INTERVAL '2 days',
     'PRESENCIAL',
     'PROGRAMADA',
     'Control cardiológico anual y revisión de presión arterial.',
     'a0000000-0000-0000-0000-000000000003');

-- 6. Insertar Registro Médico Previo (EHR de Juan Pérez con el Dr. Mendoza)
INSERT INTO registros_medicos (id, id_cita, id_paciente, id_medico, motivo_consulta, examen_fisico, evolucion_clinica, notas_privadas_doctor, fecha_consulta) VALUES
    ('e0000000-0000-0000-0000-000000000001',
     NULL,
     'c0000000-0000-0000-0000-000000000001',
     'b0000000-0000-0000-0000-000000000001',
     'Paciente refiere dolor opresivo precordial de 20 minutos de duración tras subir escaleras.',
     'PA: 145/90 mmHg | FC: 86 lpm | FR: 18 rpm | Ruidos cardíacos rítmicos, sin soplos. Pulsos periféricos presentes.',
     'Cuadro clínico compatible con angina de pecho estable. Se indica inicio de tratamiento farmacológico protector y solicitud de ecocardiograma transtorácico.',
     'RESTRICCIÓN ÉTICA: El paciente manifiesta alto nivel de ansiedad laboral y dificultades económicas para costear la totalidad de los fármacos. No alarmar sobre riesgo isquémico hasta confirmar estudios.',
     NOW() - INTERVAL '15 days');

-- 7. Insertar Diagnóstico CIE-10 para la Consulta
INSERT INTO diagnosticos_cie (id_registro_medico, codigo_cie10, descripcion, tipo, es_principal) VALUES
    ('e0000000-0000-0000-0000-000000000001', 'I20.9', 'Angina de pecho, no especificada', 'CONFIRMADO', TRUE),
    ('e0000000-0000-0000-0000-000000000001', 'I10', 'Hipertensión esencial (primaria)', 'CONFIRMADO', FALSE);

-- 8. Insertar Receta Médica Asociada
INSERT INTO recetas (id, id_registro_medico, id_paciente, id_medico, fecha_vencimiento, estado, indicaciones_generales) VALUES
    ('f0000000-0000-0000-0000-000000000001',
     'e0000000-0000-0000-0000-000000000001',
     'c0000000-0000-0000-0000-000000000001',
     'b0000000-0000-0000-0000-000000000001',
     CURRENT_DATE + INTERVAL '30 days',
     'ACTIVA',
     'Tomar medicamentos con abundante agua. No suspender sin indicación médica.');

INSERT INTO recetas_items (id_receta, medicamento, dosis, frecuencia, duracion_dias, cantidad_recetada, instrucciones_especificas) VALUES
    ('f0000000-0000-0000-0000-000000000001', 'Aspirina Protect', '100 mg', 'Cada 24 horas después del almuerzo', 30, 30, 'Vía oral'),
    ('f0000000-0000-0000-0000-000000000001', 'Atorvastatina', '20 mg', 'Cada 24 horas antes de acostarse', 30, 30, 'Vía oral');

-- 9. Registrar Auditoría Inicial
INSERT INTO auditoria_accesos (id_usuario, email_usuario, rol_usuario, accion, recurso, id_recurso, ip_origen, detalles) VALUES
    ('a0000000-0000-0000-0000-000000000001', 'admin@hospital.com', 'ADMIN', 'CREATE', 'SISTEMA_INICIALIZACION', 'SEED_DATA', '127.0.0.1', '{"mensaje": "Base de datos hospital_db inicializada con tablas y datos semilla"}');
