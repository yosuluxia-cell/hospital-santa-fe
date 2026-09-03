import { Request, Response } from 'express';
import { AuditAction } from '../constants/auditActions';
import { auditService } from '../services/audit.service';
import { UserRole } from '../constants/roles';
import { pool } from '../database/db';

// Catálogo CIE-10 para autocompletado y búsqueda rápida
export const CIE10_CATALOG = [
  { code: 'I10', description: 'Hipertensión esencial (primaria)', category: 'Cardiovascular' },
  { code: 'I20.9', description: 'Angina de pecho, no especificada', category: 'Cardiovascular' },
  { code: 'I21.9', description: 'Infarto agudo del miocardio, no especificado', category: 'Cardiovascular' },
  { code: 'I50.9', description: 'Insuficiencia cardíaca, no especificada', category: 'Cardiovascular' },
  { code: 'E11.9', description: 'Diabetes mellitus tipo 2 sin mención de complicación', category: 'Endocrino' },
  { code: 'E78.5', description: 'Hiperlipidemia, no especificada (Colesterol / Triglicéridos)', category: 'Endocrino' },
  { code: 'J00', description: 'Rinofaringitis aguda (resfriado común)', category: 'Respiratorio' },
  { code: 'J06.9', description: 'Infección aguda de las vías respiratorias superiores', category: 'Respiratorio' },
  { code: 'J18.9', description: 'Neumonía, no especificada', category: 'Respiratorio' },
  { code: 'J45.9', description: 'Asma, no especificada', category: 'Respiratorio' },
  { code: 'K29.7', description: 'Gastritis, no especificada', category: 'Digestivo' },
  { code: 'K21.9', description: 'Enfermedad del reflujo gastroesofágico sin esofagitis', category: 'Digestivo' },
  { code: 'M54.5', description: 'Lumbago no especificado (Dolor lumbar)', category: 'Músculo-Esquelético' },
  { code: 'R07.4', description: 'Dolor en el pecho, no especificado', category: 'Síntomas Generales' },
  { code: 'R51', description: 'Cefalea (Dolor de cabeza)', category: 'Síntomas Generales' },
  { code: 'R50.9', description: 'Fiebre, no especificada', category: 'Síntomas Generales' },
];

export class ClinicalController {
  /**
   * Catálogo de Códigos CIE-10 para autocompletado
   */
  public static async getCie10(req: Request, res: Response): Promise<void> {
    const { q } = req.query;
    let results = CIE10_CATALOG;

    if (q && typeof q === 'string') {
      const term = q.toLowerCase();
      results = CIE10_CATALOG.filter(
        c => c.code.toLowerCase().includes(term) || c.description.toLowerCase().includes(term)
      );
    }

    res.status(200).json({
      success: true,
      data: results
    });
  }

  /**
   * Agenda de Citas del Médico (Consultando PostgreSQL)
   */
  public static async getDoctorAppointments(req: Request, res: Response): Promise<void> {
    const actor = req.user!;
    try {
      let queryText = `
        SELECT c.id, c.fecha_hora, c.modalidad, c.estado, c.motivo, c.enlace_telemedicina,
               p.id AS patient_id, p.documento_identidad, p.nombre AS paciente_nombre,
               p.apellido AS paciente_apellido, p.fecha_nacimiento, p.genero,
               p.tipo_sangre, p.alergias, p.antecedentes_medicos, p.telefono,
               m.id AS id_medico, u.nombre || ' ' || u.apellido AS medico_nombre, m.especialidad
        FROM citas c
        JOIN pacientes p ON c.id_paciente = p.id
        JOIN medicos m ON c.id_medico = m.id
        JOIN usuarios u ON m.id_usuario = u.id
      `;
      const params: any[] = [];

      if (actor.role === UserRole.DOCTOR && actor.staffId) {
        queryText += ` WHERE c.id_medico = $1 `;
        params.push(actor.staffId);
      }

      queryText += ` ORDER BY c.fecha_hora ASC `;

      const dbRes = await pool.query(queryText, params);
      res.status(200).json({
        success: true,
        data: dbRes.rows
      });
    } catch (err: any) {
      console.warn('[DB WARNING] Error al consultar citas en PostgreSQL:', err.message);
      res.status(500).json({
        success: false,
        message: 'Error al consultar la agenda médica.'
      });
    }
  }

  /**
   * Obtener expediente clínico de un paciente (PostgreSQL)
   * Aplica restricción ética: Paciente no ve notas privadas del médico
   */
  public static async getPatientConsultations(req: Request, res: Response): Promise<void> {
    const { patientId } = req.params;
    const actor = req.user!;

    // Auditoría de lectura de expediente de salud protegido (PHI)
    await auditService.log({
      actorId: actor.userId,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: AuditAction.READ_PHI,
      resource: 'REGISTROS_MEDICOS',
      patientId,
      ipAddress: req.ip || req.socket.remoteAddress || '127.0.0.1',
      userAgent: req.get('user-agent'),
      details: { accessGranted: true }
    });

    try {
      const queryText = `
        SELECT rm.id, rm.id_cita, rm.id_paciente, p.nombre || ' ' || p.apellido AS paciente_nombre,
               rm.id_medico, u.nombre || ' ' || u.apellido AS doctor_nombre, m.especialidad,
               rm.fecha_consulta, rm.motivo_consulta, rm.examen_fisico, rm.evolucion_clinica,
               rm.notas_privadas_doctor,
               COALESCE(
                 json_agg(
                   json_build_object(
                     'id', d.id,
                     'codigo_cie10', d.codigo_cie10,
                     'descripcion', d.descripcion,
                     'tipo', d.tipo,
                     'es_principal', d.es_principal
                   )
                 ) FILTER (WHERE d.id IS NOT NULL), '[]'
               ) AS diagnosticos
        FROM registros_medicos rm
        JOIN pacientes p ON rm.id_paciente = p.id
        JOIN medicos m ON rm.id_medico = m.id
        JOIN usuarios u ON m.id_usuario = u.id
        LEFT JOIN diagnosticos_cie d ON d.id_registro_medico = rm.id
        WHERE rm.id_paciente = $1
        GROUP BY rm.id, p.id, m.id, u.id
        ORDER BY rm.fecha_consulta DESC
      `;

      const dbRes = await pool.query(queryText, [patientId]);

      // El middleware sanitizePatientResponse se encargará de purgar notas_privadas_doctor
      // si actor.role === PATIENT de manera transparente
      res.status(200).json({
        success: true,
        data: dbRes.rows,
        meta: {
          totalRecords: dbRes.rows.length,
          retrievedByRole: actor.role,
          isPrivateNotesStripped: actor.role === UserRole.PATIENT
        }
      });
    } catch (err: any) {
      console.warn('[DB WARNING] Error al consultar historial clínico:', err.message);
      res.status(500).json({ success: false, message: 'Error al consultar historial clínico.' });
    }
  }

  /**
   * Registro de nueva consulta médica (Solo Médicos en PostgreSQL)
   */
  public static async createConsultation(req: Request, res: Response): Promise<void> {
    const actor = req.user!;
    const {
      appointmentId,
      patientId,
      subjectiveSymptoms,
      objectivePhysicalExam,
      clinicalEvolution,
      doctorPrivateNotes,
      diagnoses,
      prescriptions
    } = req.body;

    if (!patientId || !subjectiveSymptoms || !clinicalEvolution) {
      res.status(400).json({
        success: false,
        message: 'Faltan campos obligatorios para la consulta médica (Motivo y Evolución son requeridos).'
      });
      return;
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Obtener id_medico del doctor autenticado
      let doctorId = actor.staffId;
      if (!doctorId) {
        const medRes = await client.query('SELECT id FROM medicos WHERE id_usuario = $1', [actor.userId]);
        if (medRes.rows.length > 0) {
          doctorId = medRes.rows[0].id;
        } else {
          const firstMed = await client.query('SELECT id FROM medicos LIMIT 1');
          doctorId = firstMed.rows[0]?.id;
        }
      }

      // 2. Insertar Registro Médico
      const insertRecordSql = `
        INSERT INTO registros_medicos 
          (id_cita, id_paciente, id_medico, motivo_consulta, examen_fisico, evolucion_clinica, notas_privadas_doctor, fecha_consulta)
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        RETURNING id, fecha_consulta
      `;
      const recordRes = await client.query(insertRecordSql, [
        appointmentId || null,
        patientId,
        doctorId,
        subjectiveSymptoms,
        objectivePhysicalExam || '',
        clinicalEvolution,
        doctorPrivateNotes || null
      ]);

      const recordId = recordRes.rows[0].id;

      // 3. Insertar Diagnósticos CIE-10
      if (Array.isArray(diagnoses) && diagnoses.length > 0) {
        for (let i = 0; i < diagnoses.length; i++) {
          const diag = diagnoses[i];
          await client.query(
            `INSERT INTO diagnosticos_cie (id_registro_medico, codigo_cie10, descripcion, tipo, es_principal)
             VALUES ($1, $2, $3, $4, $5)`,
            [
              recordId,
              diag.code || diag.codigo_cie10,
              diag.description || diag.descripcion,
              diag.type || 'CONFIRMADO',
              i === 0
            ]
          );
        }
      }

      // 4. Insertar Receta Médica si fue indicada
      if (Array.isArray(prescriptions) && prescriptions.length > 0) {
        const rxRes = await client.query(
          `INSERT INTO recetas (id_registro_medico, id_paciente, id_medico, fecha_vencimiento, estado, indicaciones_generales)
           VALUES ($1, $2, $3, CURRENT_DATE + INTERVAL '30 days', 'ACTIVA', 'Tratamiento ambulatorio')
           RETURNING id`,
          [recordId, patientId, doctorId]
        );
        const rxId = rxRes.rows[0].id;

        for (const item of prescriptions) {
          await client.query(
            `INSERT INTO recetas_items (id_receta, medicamento, dosis, frecuencia, duracion_dias, cantidad_recetada, instrucciones_especificas)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              rxId,
              item.medication || item.medicamento,
              item.dosage || item.dosis || '1 unidad',
              item.frequency || item.frecuencia || 'Cada 24 horas',
              item.durationDays || item.duracion_dias || 7,
              item.quantity || item.cantidad || 1,
              item.instructions || item.instrucciones || ''
            ]
          );
        }
      }

      // 5. Actualizar estado de la cita si aplica
      if (appointmentId) {
        await client.query(`UPDATE citas SET estado = 'ATENDIDA', fecha_actualizacion = NOW() WHERE id = $1`, [appointmentId]);
      }

      await client.query('COMMIT');

      // 6. Auditoría inmutable
      await auditService.log({
        actorId: actor.userId,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: AuditAction.CREATE,
        resource: 'REGISTROS_MEDICOS',
        resourceId: recordId,
        patientId,
        ipAddress: req.ip || req.socket.remoteAddress || '127.0.0.1',
        userAgent: req.get('user-agent'),
        details: { diagnosesCount: diagnoses?.length || 0, hasPrivateNotes: !!doctorPrivateNotes }
      });

      res.status(201).json({
        success: true,
        message: 'Consulta médica registrada con éxito en el EMR.',
        data: {
          id: recordId,
          patientId,
          doctorId,
          consultationDate: recordRes.rows[0].fecha_consulta
        }
      });
    } catch (err: any) {
      await client.query('ROLLBACK');
      console.error('[CLINICAL ERROR] Error al registrar consulta:', err);
      res.status(500).json({ success: false, message: 'Error interno al guardar la consulta médica: ' + err.message });
    } finally {
      client.release();
    }
  }

  /**
   * Consulta de recetas médicas de un paciente
   */
  public static async getPrescriptions(req: Request, res: Response): Promise<void> {
    const { patientId } = req.params;
    try {
      const queryText = `
        SELECT r.id, r.fecha_emision, r.fecha_vencimiento, r.estado, r.indicaciones_generales,
               u.nombre || ' ' || u.apellido AS medico_nombre, m.especialidad,
               COALESCE(
                 json_agg(
                   json_build_object(
                     'medicamento', ri.medicamento,
                     'dosis', ri.dosis,
                     'frecuencia', ri.frecuencia,
                     'duracion_dias', ri.duracion_dias,
                     'cantidad_recetada', ri.cantidad_recetada,
                     'cantidad_dispensada', ri.cantidad_dispensada,
                     'instrucciones', ri.instrucciones_especificas
                   )
                 ) FILTER (WHERE ri.id IS NOT NULL), '[]'
               ) AS items
        FROM recetas r
        JOIN medicos m ON r.id_medico = m.id
        JOIN usuarios u ON m.id_usuario = u.id
        LEFT JOIN recetas_items ri ON ri.id_receta = r.id
        WHERE r.id_paciente = $1
        GROUP BY r.id, u.id, m.id
        ORDER BY r.fecha_emision DESC
      `;
      const dbRes = await pool.query(queryText, [patientId]);
      res.status(200).json({
        success: true,
        data: dbRes.rows
      });
    } catch (err: any) {
      console.warn('[DB WARNING] Error al consultar recetas:', err.message);
      res.status(500).json({ success: false, message: 'Error al consultar recetas.' });
    }
  }

  /**
   * Consulta de Logs de Auditoría (Exclusivo Administrador TI)
   */
  public static async getAuditLogs(req: Request, res: Response): Promise<void> {
    try {
      const dbRes = await pool.query(
        `SELECT id, email_usuario, rol_usuario, accion, recurso, id_recurso, ip_origen, fecha_evento, detalles
         FROM auditoria_accesos
         ORDER BY fecha_evento DESC
         LIMIT 50`
      );
      res.status(200).json({
        success: true,
        data: dbRes.rows,
        count: dbRes.rows.length
      });
    } catch (err: any) {
      res.status(200).json({
        success: true,
        data: auditService.getRecentLogs(50),
        count: 50
      });
    }
  }

  /**
   * Citas del Paciente (Portal de Paciente)
   */
  public static async getPatientAppointments(req: Request, res: Response): Promise<void> {
    const { patientId } = req.params;
    try {
      const queryText = `
        SELECT c.id, c.fecha_hora, c.modalidad, c.estado, c.motivo, c.enlace_telemedicina,
               m.id AS id_medico, u.nombre || ' ' || u.apellido AS medico_nombre, m.especialidad
        FROM citas c
        JOIN medicos m ON c.id_medico = m.id
        JOIN usuarios u ON m.id_usuario = u.id
        WHERE c.id_paciente = $1
        ORDER BY c.fecha_hora DESC
      `;
      const dbRes = await pool.query(queryText, [patientId]);
      res.status(200).json({ success: true, data: dbRes.rows });
    } catch (err: any) {
      res.status(500).json({ success: false, message: 'Error al consultar citas del paciente.' });
    }
  }

  /**
   * Programar / Solicitar Nueva Cita Médica
   */
  public static async scheduleAppointment(req: Request, res: Response): Promise<void> {
    const actor = req.user!;
    const { patientId, doctorId, appointmentDate, modality, reason } = req.body;

    if (!patientId || !appointmentDate) {
      res.status(400).json({ success: false, message: 'Paciente y fecha de cita son obligatorios.' });
      return;
    }

    try {
      let targetDoctorId = doctorId;
      if (!targetDoctorId) {
        const medRes = await pool.query('SELECT id FROM medicos LIMIT 1');
        targetDoctorId = medRes.rows[0]?.id;
      }

      const isTele = modality === 'TELEMEDICINA';
      const meetingUrl = isTele ? `https://telemed.hospital.com/room/c-${Date.now()}` : null;

      const insertSql = `
        INSERT INTO citas (id_paciente, id_medico, fecha_hora, modalidad, estado, motivo, enlace_telemedicina, creado_por)
        VALUES ($1, $2, $3, $4, 'PROGRAMADA', $5, $6, $7)
        RETURNING id, fecha_hora, modalidad, estado, motivo, enlace_telemedicina
      `;
      const insertRes = await pool.query(insertSql, [
        patientId,
        targetDoctorId,
        appointmentDate,
        modality || 'PRESENCIAL',
        reason || 'Consulta médica general',
        meetingUrl,
        actor.userId
      ]);

      await auditService.log({
        actorId: actor.userId,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: AuditAction.CREATE,
        resource: 'CITAS',
        resourceId: insertRes.rows[0].id,
        patientId,
        ipAddress: req.ip || req.socket.remoteAddress || '127.0.0.1',
        details: { modality, appointmentDate }
      });

      res.status(201).json({
        success: true,
        message: 'Cita médica agendada correctamente.',
        data: insertRes.rows[0]
      });
    } catch (err: any) {
      console.error('[APPOINTMENT ERROR] Error al agendar cita:', err);
      res.status(500).json({ success: false, message: 'Error al agendar cita: ' + err.message });
    }
  }

  /**
   * Cancelar Cita Médica
   */
  public static async cancelAppointment(req: Request, res: Response): Promise<void> {
    const { appointmentId } = req.params;
    const actor = req.user!;

    try {
      await pool.query(
        `UPDATE citas SET estado = 'CANCELADA', fecha_actualizacion = NOW() WHERE id = $1`,
        [appointmentId]
      );

      await auditService.log({
        actorId: actor.userId,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: AuditAction.UPDATE,
        resource: 'CITAS',
        resourceId: appointmentId,
        ipAddress: req.ip || req.socket.remoteAddress || '127.0.0.1',
        details: { action: 'CANCEL_APPOINTMENT' }
      });

      res.status(200).json({ success: true, message: 'Cita cancelada correctamente.' });
    } catch (err: any) {
      res.status(500).json({ success: false, message: 'Error al cancelar cita.' });
    }
  }

  /**
   * Lista de Médicos Activos (Para desplegable de citas)
   */
  public static async getDoctorsList(req: Request, res: Response): Promise<void> {
    try {
      const resDb = await pool.query(
        `SELECT m.id, u.nombre || ' ' || u.apellido AS nombre_completo, m.especialidad, m.departamento
         FROM medicos m
         JOIN usuarios u ON m.id_usuario = u.id
         WHERE m.activo = TRUE`
      );
      res.status(200).json({ success: true, data: resDb.rows });
    } catch (err: any) {
      res.status(500).json({ success: false, message: 'Error al obtener médicos.' });
    }
  }

  /**
   * Registro y Admisión Completa de Pacientes Nuevos
   */
  public static async createAdmission(req: Request, res: Response): Promise<void> {
    const {
      firstName,
      lastName,
      nationalId,
      dateOfBirth,
      biologicalSex,
      genderIdentity,
      phone,
      email,
      address,
      emergencyContactName,
      emergencyContactRelationship,
      emergencyContactPhone,
      insuranceProvider,
      reason,
      // Triaje y signos vitales
      bloodPressure,
      heartRate,
      respiratoryRate,
      temperature,
      oxygenSaturation,
      weightKg,
      heightCm,
      bmi,
      // Anamnesis
      criticalAllergies,
      chronicConditions,
      currentMedications,
      surgicalHistory,
      familyHistory,
      // Asignación
      doctorId,
      status // EN_ESPERA, TRIAJE, EN_CONSULTA, OBSERVACION, FINALIZADA
    } = req.body;

    if (!firstName || !lastName || !nationalId) {
      res.status(400).json({ success: false, message: 'Nombres, apellidos y cédula/documento son obligatorios.' });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Insertar o actualizar paciente
      const patientRes = await client.query(
        `INSERT INTO pacientes (
          documento_identidad, nombre, apellido, fecha_nacimiento, genero,
          sexo_biologico, identidad_genero, telefono, email, direccion,
          contacto_emergencia_nombre, contacto_emergencia_parentesco, contacto_emergencia_telefono,
          seguro_medico, alergias, antecedentes_medicos, medicamentos_actuales,
          antecedentes_quirurgicos, antecedentes_familiares, peso_kg, talla_cm, imc, estado_atencion
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9, $10,
          $11, $12, $13,
          $14, $15, $16, $17,
          $18, $19, $20, $21, $22, $23
        )
        ON CONFLICT (documento_identidad) DO UPDATE SET
          nombre = EXCLUDED.nombre,
          apellido = EXCLUDED.apellido,
          fecha_nacimiento = EXCLUDED.fecha_nacimiento,
          sexo_biologico = EXCLUDED.sexo_biologico,
          identidad_genero = EXCLUDED.identidad_genero,
          telefono = EXCLUDED.telefono,
          email = EXCLUDED.email,
          direccion = EXCLUDED.direccion,
          contacto_emergencia_nombre = EXCLUDED.contacto_emergencia_nombre,
          contacto_emergencia_parentesco = EXCLUDED.contacto_emergencia_parentesco,
          contacto_emergencia_telefono = EXCLUDED.contacto_emergencia_telefono,
          seguro_medico = EXCLUDED.seguro_medico,
          alergias = EXCLUDED.alergias,
          antecedentes_medicos = EXCLUDED.antecedentes_medicos,
          medicamentos_actuales = EXCLUDED.medicamentos_actuales,
          antecedentes_quirurgicos = EXCLUDED.antecedentes_quirurgicos,
          antecedentes_familiares = EXCLUDED.antecedentes_familiares,
          peso_kg = EXCLUDED.peso_kg,
          talla_cm = EXCLUDED.talla_cm,
          imc = EXCLUDED.imc,
          estado_atencion = EXCLUDED.estado_atencion,
          fecha_actualizacion = NOW()
        RETURNING *`,
        [
          nationalId.trim(),
          firstName.trim(),
          lastName.trim(),
          dateOfBirth || '2000-01-01',
          biologicalSex || 'Masculino',
          biologicalSex || 'Masculino',
          genderIdentity || biologicalSex || 'Masculino',
          phone || '',
          email || '',
          address || 'Distrito Santa Fe',
          emergencyContactName || '',
          emergencyContactRelationship || '',
          emergencyContactPhone || '',
          insuranceProvider || 'Particular',
          criticalAllergies || '',
          chronicConditions || '',
          currentMedications || '',
          surgicalHistory || '',
          familyHistory || '',
          weightKg ? parseFloat(weightKg) : null,
          heightCm ? parseFloat(heightCm) : null,
          bmi ? parseFloat(bmi) : null,
          status || 'EN_ESPERA'
        ]
      );

      const patient = patientRes.rows[0];

      // 2. Buscar o asignar médico predeterminado si no se envió
      let assignedDoctorId = doctorId;
      if (!assignedDoctorId) {
        const docRes = await client.query(`SELECT id FROM medicos WHERE activo = TRUE LIMIT 1`);
        if (docRes.rows.length > 0) assignedDoctorId = docRes.rows[0].id;
      }

      // 3. Mapeo de estados de cita
      const appointmentStatusMap: Record<string, string> = {
        'EN_ESPERA': 'PROGRAMADA',
        'TRIAJE': 'CONFIRMADA',
        'EN_CONSULTA': 'EN_ATENCION',
        'OBSERVACION': 'EN_ATENCION',
        'FINALIZADA': 'ATENDIDA'
      };

      const citaRes = await client.query(
        `INSERT INTO citas (
          id_paciente, id_medico, fecha_hora, modalidad, estado, estado_atencion, motivo,
          presion_arterial, frecuencia_cardiaca, frecuencia_respiratoria,
          temperatura, saturacion_oxigeno, peso_kg, talla_cm, imc
        ) VALUES (
          $1, $2, NOW(), 'PRESENCIAL', $3, $4, $5,
          $6, $7, $8,
          $9, $10, $11, $12, $13
        ) RETURNING *`,
        [
          patient.id,
          assignedDoctorId,
          appointmentStatusMap[status] || 'PROGRAMADA',
          status || 'EN_ESPERA',
          reason || 'Admisión general de paciente',
          bloodPressure || null,
          heartRate ? parseInt(heartRate, 10) : null,
          respiratoryRate ? parseInt(respiratoryRate, 10) : null,
          temperature ? parseFloat(temperature) : null,
          oxygenSaturation ? parseFloat(oxygenSaturation) : null,
          weightKg ? parseFloat(weightKg) : null,
          heightCm ? parseFloat(heightCm) : null,
          bmi ? parseFloat(bmi) : null
        ]
      );

      await client.query('COMMIT');

      // 4. Registrar evento de auditoría
      const actor = req.user;
      await auditService.log({
        actorId: actor?.userId || patient.id,
        actorEmail: actor?.email || 'admision@hospital-santafe.gob.bo',
        actorRole: actor?.role || UserRole.ADMIN,
        action: AuditAction.CREATE,
        resource: 'PACIENTES_ADMISIÓN',
        resourceId: patient.id,
        ipAddress: req.ip || req.socket.remoteAddress || '127.0.0.1',
        details: {
          paciente: `${patient.nombre} ${patient.apellido}`,
          documento: patient.documento_identidad,
          estado_atencion: status || 'EN_ESPERA',
          motivo: reason
        }
      });

      res.status(201).json({
        success: true,
        message: 'Paciente admitido y registrado exitosamente en Supabase.',
        data: {
          patient,
          appointment: citaRes.rows[0]
        }
      });
    } catch (err: any) {
      await client.query('ROLLBACK');
      console.error('[ADMISSION ERROR] Error al admitir paciente:', err);
      res.status(500).json({ success: false, message: 'Error en admisión: ' + err.message });
    } finally {
      client.release();
    }
  }
}
