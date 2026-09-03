/**
 * Sistema de Gestión Hospitalaria & EMR - Frontend Controller
 * Hospital de Santa Fe (Distrito Santa Fe) - Municipio de San Carlos
 * Control de Acceso Basado en Roles (RBAC) y Seguridad HIPAA
 */

// Estado global de la aplicación (Sin sesión por defecto)
const state = {
  token: localStorage.getItem('emr_token') || null,
  user: JSON.parse(localStorage.getItem('emr_user') || 'null'),
  currentSlide: 0,
  slideInterval: null,
  appointments: [],
  selectedAppointment: null,
  selectedPatientHistory: [],
  selectedDiagnoses: [],
  prescriptionItems: [],
  cie10List: [],
  doctorsList: [],
  auditLogs: [],
  triageRecords: [
    {
      patient: 'Juan Pérez',
      ci: 'CI-4589214',
      blood: 'O+',
      pa: '125/82 mmHg',
      fc: '74 lpm',
      spo2: '98%',
      temp: '36.6 °C',
      level: 'AMARILLO',
      levelText: 'NIVEL 3: AMARILLO',
      box: 'Box 3 (Cardiología)',
      status: 'En Espera Médico'
    },
    {
      patient: 'María Gómez',
      ci: 'CI-7812903',
      blood: 'A+',
      pa: '118/75 mmHg',
      fc: '68 lpm',
      spo2: '99%',
      temp: '36.5 °C',
      level: 'VERDE',
      levelText: 'NIVEL 4: VERDE',
      box: 'Box 1 (Consultorio)',
      status: 'Atendida'
    }
  ]
};

window.state = state;
window.appState = state;

const API_BASE = window.API_BASE_URL || localStorage.getItem('api_base_url') || '/api';

// ==============================================================================
// 1. INICIALIZACIÓN
// ==============================================================================
document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

function initApp() {
  // Inicialización en la portada principal (Sin sesiones forzadas)
  showLandingView();

  setupEventListeners();
  initSlider();
  loadCie10Catalog();
  loadDoctorsList();

  // Soporte de Hash Router para URLs directas (ej. #panel-medico, #misalud)
  handleHashNavigation();
  window.addEventListener('hashchange', handleHashNavigation);
}

function setupEventListeners() {
  // Botones de Logout en todos los paneles
  document.querySelectorAll('.btn-logout').forEach(btn => {
    btn.addEventListener('click', handleLogout);
  });

  // Buscador CIE-10 (Doctor)
  const cieSearch = document.getElementById('cie10-search');
  if (cieSearch) {
    cieSearch.addEventListener('input', handleCie10Search);
  }

  // Agregar fila de receta (Doctor)
  const btnAddRx = document.getElementById('btn-add-rx');
  if (btnAddRx) {
    btnAddRx.addEventListener('click', addPrescriptionRow);
  }

  // Guardar consulta clínica (Doctor)
  const consultForm = document.getElementById('consultation-form');
  if (consultForm) {
    consultForm.addEventListener('submit', handleSaveConsultation);
  }

  // Agendar cita
  const formSchedule = document.getElementById('form-schedule-appointment');
  if (formSchedule) {
    formSchedule.addEventListener('submit', handleScheduleAppointment);
  }
}

function handleHashNavigation() {
  const hash = window.location.hash.toLowerCase();
  if (hash === '#panel-medico' || hash === '#doctor') {
    navigateTo('doctor');
  } else if (hash === '#misalud' || hash === '#paciente' || hash === '#patient') {
    navigateTo('patient');
  } else if (hash === '#enfermeria' || hash === '#nurse' || hash === '#triaje') {
    navigateTo('nurse');
  } else if (hash === '#admin' || hash === '#auditoria') {
    navigateTo('admin');
  } else if (hash === '#login') {
    showRoleLoginView();
  }
}

// ==============================================================================
// 2. CONTROL DE ACCESO BASADO EN ROLES (RBAC ROUTER & REDIRECCIÓN)
// ==============================================================================
window.navigateTo = function(targetRole) {
  const isAuth = !!state.token;
  const currentRole = state.user?.role;

  // 1. MÉDICO (DOCTOR)
  if (targetRole === 'doctor') {
    if (!isAuth) {
      showToast('⚠️ Acceso restringido: Debes autenticarte como Médico para ver el Panel Clínico.');
      showRoleLoginView('doctor', 'Acceso restringido: Se requieren credenciales facultativas para ingresar al Panel Clínico.');
      return;
    }
    if (currentRole !== 'DOCTOR' && currentRole !== 'ADMIN') {
      showToast(`⛔ Acceso denegado: Tu perfil (${currentRole}) no tiene permisos para acceder al Panel Médico.`);
      redirectToOwnPortal();
      return;
    }
    showDoctorDashboard();
    return;
  }

  // 2. PACIENTE (PATIENT)
  if (targetRole === 'patient') {
    if (!isAuth) {
      showToast('👤 Ingresa tu Cédula de Identidad (CI) para acceder al portal MiSalud.');
      showRoleLoginView('patient', 'Por favor ingresa tu Cédula de Identidad (CI) para consultar tus recetas y citas.');
      return;
    }
    if (currentRole !== 'PATIENT') {
      showToast(`ℹ️ Tu sesión activa corresponde al rol ${currentRole}.`);
      redirectToOwnPortal();
      return;
    }
    showPatientPortal();
    return;
  }

  // 3. ENFERMERÍA (NURSE)
  if (targetRole === 'nurse') {
    if (!isAuth) {
      showToast('⚠️ Acceso restringido: Debes autenticarte con tu cuenta de Enfermería.');
      showRoleLoginView('nurse', 'Acceso restringido: Se requieren credenciales de Enfermería para el Módulo de Triaje.');
      return;
    }
    if (currentRole !== 'NURSE' && currentRole !== 'ENFERMERO' && currentRole !== 'ADMIN') {
      showToast(`⛔ Acceso denegado: Tu perfil (${currentRole}) no tiene acceso a Triaje.`);
      redirectToOwnPortal();
      return;
    }
    showNursePortal();
    return;
  }

  // 4. ADMINISTRADOR (ADMIN)
  if (targetRole === 'admin') {
    if (!isAuth) {
      showToast('🛡️ Acceso restringido: Requiere credenciales de Administrador TI.');
      showRoleLoginView('admin', 'Acceso restringido: Se requieren credenciales de Administrador para ver los logs de auditoría.');
      return;
    }
    if (currentRole !== 'ADMIN') {
      showToast(`⛔ Acceso denegado: Requiere rol de Administrador TI.`);
      redirectToOwnPortal();
      return;
    }
    showAdminPortal();
    return;
  }

  showLandingView();
};

function redirectToOwnPortal() {
  const role = state.user?.role;
  if (role === 'DOCTOR') showDoctorDashboard();
  else if (role === 'PATIENT') showPatientPortal();
  else if (role === 'NURSE' || role === 'ENFERMERO') showNursePortal();
  else if (role === 'ADMIN') showAdminPortal();
  else showLandingView();
}

// ==============================================================================
// 3. NAVEGACIÓN ENTRE VISTAS PRINCIPALES (SPA)
// ==============================================================================
window.showLandingView = function() {
  document.getElementById('view-landing').classList.remove('hidden');
  document.getElementById('view-role-login').classList.add('hidden');
  document.getElementById('view-dashboard').classList.add('hidden');
  document.getElementById('view-patient').classList.add('hidden');
  document.getElementById('view-nurse').classList.add('hidden');
  document.getElementById('view-admin').classList.add('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.showRoleLoginView = function(selectedRole = 'patient', redirectMessage = null) {
  document.getElementById('view-landing').classList.add('hidden');
  document.getElementById('view-dashboard').classList.add('hidden');
  document.getElementById('view-patient').classList.add('hidden');
  document.getElementById('view-nurse').classList.add('hidden');
  document.getElementById('view-admin').classList.add('hidden');
  document.getElementById('view-role-login').classList.remove('hidden');

  const alertBox = document.getElementById('login-redirect-alert');
  if (redirectMessage && alertBox) {
    alertBox.innerHTML = `⚠️ <strong>Acceso Restringido:</strong> ${redirectMessage}`;
    alertBox.classList.remove('hidden');
  } else if (alertBox) {
    alertBox.classList.add('hidden');
  }

  selectLoginRoleTab(selectedRole);
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.selectLoginRoleTab = function(role) {
  const roles = ['patient', 'doctor', 'nurse', 'admin'];
  
  roles.forEach(r => {
    const card = document.getElementById(`card-tab-${r}`);
    const formBox = document.getElementById(`login-form-${r}-box`);
    if (card) {
      if (r === role) card.classList.add('selected');
      else card.classList.remove('selected');
    }
    if (formBox) {
      if (r === role) formBox.classList.remove('hidden');
      else formBox.classList.add('hidden');
    }
  });
};

window.fillPatientCi = function(ci) {
  const input = document.getElementById('patient-ci-input');
  if (input) input.value = ci;
};

window.scrollToSection = function(sectionId) {
  showLandingView();
  setTimeout(() => {
    const el = document.getElementById(sectionId);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 60);
};

// ==============================================================================
// 4. AUTENTICACIÓN: PACIENTES (POR CÉDULA DE IDENTIDAD - CI)
// ==============================================================================
window.handlePatientCiLogin = async function(e) {
  e.preventDefault();
  const ciInput = document.getElementById('patient-ci-input');
  const ci = ciInput.value.trim();
  const alertBox = document.getElementById('patient-login-alert');
  const btnSubmit = document.getElementById('btn-patient-submit');

  alertBox.classList.add('hidden');
  btnSubmit.disabled = true;
  btnSubmit.textContent = 'Verificando Cédula en Supabase...';

  try {
    const res = await fetch(`${API_BASE}/auth/patient-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ci })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Cédula de Identidad no encontrada.');
    }

    state.token = data.data.accessToken;
    state.user = data.data.user;
    localStorage.setItem('emr_token', state.token);
    localStorage.setItem('emr_user', JSON.stringify(state.user));

    showToast(`¡Bienvenido(a), ${state.user.firstName}! Accediendo a MiSalud...`);
    showPatientPortal();
  } catch (err) {
    alertBox.textContent = err.message;
    alertBox.classList.remove('hidden');
  } finally {
    btnSubmit.disabled = false;
    btnSubmit.textContent = 'Acceder a MiSalud ➔';
  }
};

// ==============================================================================
// 5. AUTENTICACIÓN: PERSONAL (MÉDICO, ENFERMERÍA, ADMINISTRADOR)
// ==============================================================================
window.handleStaffAuth = async function(e, expectedRole) {
  e.preventDefault();
  let email = '';
  let password = '';
  let alertBox = null;
  let btnSubmit = null;

  if (expectedRole === 'DOCTOR') {
    email = document.getElementById('doctor-ident-input').value.trim();
    password = document.getElementById('doctor-pass-input').value;
    alertBox = document.getElementById('doctor-login-alert');
    btnSubmit = document.getElementById('btn-doctor-submit');
  } else if (expectedRole === 'NURSE') {
    email = document.getElementById('nurse-ident-input').value.trim();
    password = document.getElementById('nurse-pass-input').value;
    alertBox = document.getElementById('nurse-login-alert');
    btnSubmit = document.getElementById('btn-nurse-submit');
  } else if (expectedRole === 'ADMIN') {
    email = document.getElementById('admin-ident-input').value.trim();
    password = document.getElementById('admin-pass-input').value;
    alertBox = document.getElementById('admin-login-alert');
    btnSubmit = document.getElementById('btn-admin-submit');
  }

  alertBox.classList.add('hidden');
  btnSubmit.disabled = true;
  btnSubmit.textContent = 'Verificando en Supabase...';

  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Credenciales incorrectas.');
    }

    state.token = data.data.accessToken;
    state.user = data.data.user;
    localStorage.setItem('emr_token', state.token);
    localStorage.setItem('emr_user', JSON.stringify(state.user));

    const role = state.user.role;

    if (expectedRole === 'DOCTOR' && role !== 'DOCTOR') {
      throw new Error(`Esta cuenta posee el rol ${role}. Utiliza el acceso correspondiente.`);
    }
    if (expectedRole === 'NURSE' && role !== 'NURSE' && role !== 'ENFERMERO') {
      throw new Error(`Esta cuenta posee el rol ${role}. Utiliza el acceso de tu área.`);
    }
    if (expectedRole === 'ADMIN' && role !== 'ADMIN') {
      throw new Error(`Esta cuenta no tiene permisos administrativos.`);
    }

    showToast(`✅ Autenticado exitosamente como ${role}.`);

    if (role === 'DOCTOR') showDoctorDashboard();
    else if (role === 'NURSE' || role === 'ENFERMERO') showNursePortal();
    else if (role === 'ADMIN') showAdminPortal();
    else showPatientPortal();
  } catch (err) {
    alertBox.textContent = err.message;
    alertBox.classList.remove('hidden');
  } finally {
    btnSubmit.disabled = false;
    if (expectedRole === 'DOCTOR') btnSubmit.textContent = 'Ingresar al Panel Clínico ➔';
    else if (expectedRole === 'NURSE') btnSubmit.textContent = 'Ingresar a Triaje & Enfermería ➔';
    else if (expectedRole === 'ADMIN') btnSubmit.textContent = 'Ingresar a Administración TI ➔';
  }
};

function handleLogout() {
  localStorage.removeItem('emr_token');
  localStorage.removeItem('emr_user');
  state.token = null;
  state.user = null;
  state.selectedAppointment = null;
  showLandingView();
  showToast('Has cerrado sesión correctamente.');
}

// ==============================================================================
// 6. PANEL DEL MÉDICO (DOCTOR DASHBOARD & EHR)
// ==============================================================================
function showDoctorDashboard() {
  // Verificación estricta de rol antes de renderizar vista médica
  if (!state.token || (state.user?.role !== 'DOCTOR' && state.user?.role !== 'ADMIN')) {
    navigateTo('doctor');
    return;
  }

  document.getElementById('view-landing').classList.add('hidden');
  document.getElementById('view-role-login').classList.add('hidden');
  document.getElementById('view-patient').classList.add('hidden');
  document.getElementById('view-nurse').classList.add('hidden');
  document.getElementById('view-admin').classList.add('hidden');
  document.getElementById('view-dashboard').classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (state.user) {
    document.getElementById('header-doctor-name').textContent = `Dr. ${state.user.firstName} ${state.user.lastName}`;
    document.getElementById('header-doctor-role').textContent = `${state.user.role} • Matrícula MED-SCZ-8894`;
    document.getElementById('doctor-avatar-text').textContent = state.user.firstName[0] || 'D';
  }

  loadDoctorAppointments();
}

async function loadDoctorAppointments() {
  const listContainer = document.getElementById('appointments-list');
  if (!listContainer) return;
  listContainer.innerHTML = '<div style="padding:1rem; color:#64748b; text-align:center;">Cargando citas de PostgreSQL...</div>';

  try {
    const res = await fetch(`${API_BASE}/clinical/doctor/appointments`, {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });

    if (res.status === 401 || res.status === 403) {
      showToast('⚠️ Tu sesión médica expiró o no está autorizada.');
      handleLogout();
      return;
    }

    const json = await res.json();
    state.appointments = json.data || [];
    renderAppointmentsList();
    updateKpis();

    if (state.appointments.length > 0) {
      selectAppointment(state.appointments[0].id);
    }
  } catch (err) {
    listContainer.innerHTML = `<div style="padding:1rem; color:#ef4444;">Error al cargar citas: ${err.message}</div>`;
  }
}

function renderAppointmentsList() {
  const listContainer = document.getElementById('appointments-list');
  if (!listContainer) return;
  listContainer.innerHTML = '';

  if (state.appointments.length === 0) {
    listContainer.innerHTML = '<div style="padding:1.5rem; text-align:center; color:#64748b;">No hay citas asignadas para hoy.</div>';
    return;
  }

  state.appointments.forEach((apt) => {
    const isSelected = state.selectedAppointment && state.selectedAppointment.id === apt.id;
    const item = document.createElement('div');
    item.className = `appointment-item ${isSelected ? 'active' : ''}`;
    item.onclick = () => selectAppointment(apt.id);

    const timeStr = new Date(apt.fecha_hora).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const isDone = apt.estado === 'ATENDIDA';

    item.innerHTML = `
      <div class="appointment-header">
        <span class="patient-name-card">${apt.paciente_nombre} ${apt.paciente_apellido}</span>
        <span class="appointment-time">${timeStr}</span>
      </div>
      <div class="patient-dni">${apt.documento_identidad} • ${apt.genero} • Sangre: <strong>${apt.tipo_sangre || 'N/R'}</strong></div>
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span class="badge ${apt.modalidad === 'TELEMEDICINA' ? 'badge-purple' : 'badge-primary'}">${apt.modalidad}</span>
        <span class="badge ${isDone ? 'badge-success' : 'badge-warning'}">${isDone ? '✅ ATENDIDA' : '🕒 ' + apt.estado}</span>
      </div>
      ${apt.alergias ? `<div class="allergy-alert">⚠️ Alergias: ${apt.alergias}</div>` : ''}
    `;

    listContainer.appendChild(item);
  });
}

function updateKpis() {
  const total = state.appointments.length;
  const attended = state.appointments.filter(a => a.estado === 'ATENDIDA').length;
  const pending = total - attended;

  if (document.getElementById('kpi-total')) document.getElementById('kpi-total').textContent = total;
  if (document.getElementById('kpi-attended')) document.getElementById('kpi-attended').textContent = attended;
  if (document.getElementById('kpi-pending')) document.getElementById('kpi-pending').textContent = pending;
}

async function selectAppointment(appointmentId) {
  const apt = state.appointments.find(a => a.id === appointmentId);
  if (!apt) return;

  state.selectedAppointment = apt;
  renderAppointmentsList();

  document.getElementById('banner-patient-name').textContent = `${apt.paciente_nombre} ${apt.paciente_apellido}`;
  document.getElementById('banner-patient-meta').innerHTML = `
    <span><strong>Cédula:</strong> ${apt.documento_identidad}</span>
    <span><strong>Género:</strong> ${apt.genero}</span>
    <span><strong>Grupo Sanguíneo:</strong> ${apt.tipo_sangre || 'O+'}</span>
    <span><strong>Modalidad:</strong> ${apt.modalidad}</span>
  `;

  const allergyBox = document.getElementById('patient-allergy-alert');
  if (apt.alergias) {
    allergyBox.textContent = `🚨 ALERGIAS CRÍTICAS REGISTRADAS: ${apt.alergias}`;
    allergyBox.classList.remove('hidden');
  } else {
    allergyBox.classList.add('hidden');
  }

  await loadPatientMedicalHistory(apt.patient_id);

  document.getElementById('form-symptoms').value = apt.motivo || '';
  document.getElementById('form-exam').value = 'PA: 120/80 mmHg | FC: 72 lpm | SpO2: 98% | Temp: 36.5 °C';
  document.getElementById('form-evolution').value = 'Paciente masculino con evolución hemodinámica estable, ruidos cardíacos normofonéticos sin soplos.';
  document.getElementById('form-private-notes').value = 'Observación facultativa confidencial: Paciente con adherencia moderada a dieta hiposódica. Monitorear perfil lipídico trimestral.';

  state.selectedDiagnoses = [];
  state.prescriptionItems = [];
  renderDiagnosesTags();
  renderPrescriptionTable();
}

async function loadPatientMedicalHistory(patientId) {
  const historyContainer = document.getElementById('history-content');
  if (!historyContainer) return;
  historyContainer.innerHTML = '<div style="font-size:0.8rem; color:#64748b;">Cargando historial de hospital_db...</div>';

  try {
    const res = await fetch(`${API_BASE}/clinical/patients/${patientId}/consultations`, {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });

    const json = await res.json();
    state.selectedPatientHistory = json.data || [];

    if (state.selectedPatientHistory.length === 0) {
      historyContainer.innerHTML = '<div style="font-size:0.8rem; color:#64748b;">Primer ingreso: Sin consultas previas.</div>';
      return;
    }

    historyContainer.innerHTML = state.selectedPatientHistory.map(h => {
      const dateStr = new Date(h.fecha_consulta || h.date).toLocaleDateString('es-ES', { dateStyle: 'medium' });
      const diags = (h.diagnosticos || []).map(d => `<span class="badge badge-primary">${d.codigo_cie10}: ${d.descripcion}</span>`).join(' ');

      return `
        <div style="border-left: 3px solid var(--primary); padding-left: 0.75rem; margin-bottom: 0.75rem;">
          <div style="font-size:0.8rem; font-weight:700; color:var(--secondary);">${dateStr} - ${h.doctor_nombre || h.doctorName || 'Facultativo'} (${h.especialidad || 'Consulta Externa'})</div>
          <div style="font-size:0.8rem; color:#334155; margin-top:0.2rem;"><strong>Evolución:</strong> ${h.evolucion_clinica || h.clinicalEvolution}</div>
          ${diags ? `<div style="margin-top:0.35rem; display:flex; gap:0.25rem; flex-wrap:wrap;">${diags}</div>` : ''}
          ${h.notas_privadas_doctor ? `
            <div style="background:#fef3c7; border:1px dashed #d97706; padding:0.35rem; border-radius:0.3rem; margin-top:0.35rem; font-size:0.75rem; color:#92400e;">
              🔒 <strong>Nota Privada:</strong> ${h.notas_privadas_doctor}
            </div>` : ''}
        </div>
      `;
    }).join('');
  } catch (err) {
    historyContainer.innerHTML = `<div style="font-size:0.8rem; color:#ef4444;">Error al consultar historial: ${err.message}</div>`;
  }
}

async function loadCie10Catalog() {
  try {
    const res = await fetch(`${API_BASE}/clinical/cie10`, {
      headers: state.token ? { 'Authorization': `Bearer ${state.token}` } : {}
    });
    if (res.ok) {
      const json = await res.json();
      state.cie10List = json.data || [];
    }
  } catch (e) {
    console.warn('Catálogo local CIE-10 cargado');
  }
}

function handleCie10Search(e) {
  const term = e.target.value.trim().toLowerCase();
  const dropdown = document.getElementById('cie10-dropdown');
  if (!dropdown) return;

  if (term.length < 2) {
    dropdown.classList.add('hidden');
    return;
  }

  const matches = state.cie10List.filter(c =>
    c.code.toLowerCase().includes(term) || c.description.toLowerCase().includes(term)
  );

  if (matches.length === 0) {
    dropdown.innerHTML = '<div style="padding:0.5rem; font-size:0.8rem; color:#64748b;">No se encontraron códigos coincidentes</div>';
    dropdown.classList.remove('hidden');
    return;
  }

  dropdown.innerHTML = matches.slice(0, 6).map(m => `
    <div style="padding:0.4rem 0.6rem; cursor:pointer; font-size:0.8rem; border-bottom:1px solid #f1f5f9;"
         onmouseover="this.style.backgroundColor='#e0f2fe'" 
         onmouseout="this.style.backgroundColor='#fff'"
         onclick="selectCie10('${m.code}', '${m.description}')">
      <strong>${m.code}</strong> - ${m.description}
    </div>
  `).join('');

  dropdown.classList.remove('hidden');
}

window.selectCie10 = function(code, description) {
  if (!state.selectedDiagnoses.some(d => d.code === code)) {
    state.selectedDiagnoses.push({ code, description, type: 'CONFIRMADO' });
    renderDiagnosesTags();
  }
  document.getElementById('cie10-search').value = '';
  document.getElementById('cie10-dropdown').classList.add('hidden');
};

window.removeCie10 = function(code) {
  state.selectedDiagnoses = state.selectedDiagnoses.filter(d => d.code !== code);
  renderDiagnosesTags();
};

function renderDiagnosesTags() {
  const container = document.getElementById('cie10-tags-container');
  if (!container) return;
  if (state.selectedDiagnoses.length === 0) {
    container.innerHTML = '<span style="font-size:0.75rem; color:#94a3b8;">Ningún diagnóstico agregado aún.</span>';
    return;
  }

  container.innerHTML = state.selectedDiagnoses.map((d, index) => `
    <div class="cie-tag">
      <span>${index === 0 ? '★ [Principal]' : '•'} ${d.code} - ${d.description}</span>
      <span class="cie-remove-btn" onclick="removeCie10('${d.code}')">✕</span>
    </div>
  `).join('');
}

function addPrescriptionRow() {
  const med = document.getElementById('rx-med').value.trim();
  const dose = document.getElementById('rx-dose').value.trim();
  const freq = document.getElementById('rx-freq').value.trim();
  const days = parseInt(document.getElementById('rx-days').value, 10) || 7;
  const qty = parseInt(document.getElementById('rx-qty').value, 10) || 1;

  if (!med) {
    alert('Debe indicar el nombre del medicamento.');
    return;
  }

  state.prescriptionItems.push({
    medication: med,
    dosage: dose,
    frequency: freq,
    durationDays: days,
    quantity: qty
  });

  renderPrescriptionTable();

  document.getElementById('rx-med').value = '';
  document.getElementById('rx-dose').value = '';
}

window.removePrescriptionRow = function(index) {
  state.prescriptionItems.splice(index, 1);
  renderPrescriptionTable();
};

function renderPrescriptionTable() {
  const tbody = document.getElementById('rx-table-body');
  if (!tbody) return;
  if (state.prescriptionItems.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#94a3b8; font-size:0.8rem;">Sin fármacos recetados en esta consulta.</td></tr>';
    return;
  }

  tbody.innerHTML = state.prescriptionItems.map((item, idx) => `
    <tr>
      <td><strong>${item.medication}</strong></td>
      <td>${item.dosage || '1 comp'}</td>
      <td>${item.frequency || 'Cada 24 hrs'}</td>
      <td>${item.durationDays} días (Total: ${item.quantity})</td>
      <td><button type="button" class="btn btn-danger btn-sm" onclick="removePrescriptionRow(${idx})">Eliminar</button></td>
    </tr>
  `).join('');
}

async function handleSaveConsultation(e) {
  e.preventDefault();

  if (!state.selectedAppointment) {
    alert('Seleccione un paciente de la lista.');
    return;
  }

  const symptoms = document.getElementById('form-symptoms').value.trim();
  const exam = document.getElementById('form-exam').value.trim();
  const evolution = document.getElementById('form-evolution').value.trim();
  const privateNotes = document.getElementById('form-private-notes').value.trim();
  const btnSubmit = document.getElementById('btn-save-consultation');

  if (!symptoms || !evolution) {
    alert('Debe completar el motivo de consulta y la evolución clínica.');
    return;
  }

  if (state.selectedDiagnoses.length === 0) {
    state.selectedDiagnoses.push({ code: 'I20.9', description: 'Angina de pecho, no especificada', type: 'CONFIRMADO' });
    renderDiagnosesTags();
  }

  btnSubmit.disabled = true;
  btnSubmit.textContent = 'Guardando en Supabase...';

  const payload = {
    appointmentId: state.selectedAppointment.id,
    patientId: state.selectedAppointment.patient_id,
    subjectiveSymptoms: symptoms,
    objectivePhysicalExam: exam,
    clinicalEvolution: evolution,
    doctorPrivateNotes: privateNotes,
    diagnoses: state.selectedDiagnoses,
    prescriptions: state.prescriptionItems
  };

  try {
    const res = await fetch(`${API_BASE}/clinical/consultations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.token}`
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'No se pudo registrar la consulta médica.');
    }

    showToast('✅ Consulta médica y diagnóstico CIE-10 guardados exitosamente en Supabase.');

    await loadDoctorAppointments();
    await loadPatientMedicalHistory(state.selectedAppointment.patient_id);
  } catch (err) {
    alert('Error al guardar consulta: ' + err.message);
  } finally {
    btnSubmit.disabled = false;
    btnSubmit.textContent = '💾 Guardar y Finalizar Consulta Médica';
  }
}

// ==============================================================================
// 7. PORTAL DEL PACIENTE (MISALUD - CON CÉDULA DE IDENTIDAD CI)
// ==============================================================================
function showPatientPortal() {
  if (!state.token || state.user?.role !== 'PATIENT') {
    navigateTo('patient');
    return;
  }

  document.getElementById('view-landing').classList.add('hidden');
  document.getElementById('view-role-login').classList.add('hidden');
  document.getElementById('view-dashboard').classList.add('hidden');
  document.getElementById('view-nurse').classList.add('hidden');
  document.getElementById('view-admin').classList.add('hidden');
  document.getElementById('view-patient').classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (state.user) {
    document.getElementById('patient-name-display').textContent = `${state.user.firstName} ${state.user.lastName}`;
    document.getElementById('welcome-patient-name').textContent = state.user.firstName;
    document.getElementById('patient-avatar-text').textContent = state.user.firstName[0] || 'P';
    if (state.user.ci) {
      document.getElementById('patient-dni-display').textContent = `${state.user.ci} • ${state.user.tipoSangre || 'O+'}`;
    }
  }

  const patientId = state.user?.patientId || 'c0000000-0000-0000-0000-000000000001';
  loadPatientAppointments(patientId);
  loadPatientPrescriptions(patientId);
  loadPatientConsultationsHistory(patientId);
}

window.switchPatientTab = function(tabName) {
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));

  const btnId = `tab-btn-${tabName}`;
  const targetBtn = document.getElementById(btnId);
  if (targetBtn) targetBtn.classList.add('active');

  const content = document.getElementById(`patient-tab-${tabName}`);
  if (content) content.classList.remove('hidden');
};

async function loadPatientAppointments(patientId) {
  const container = document.getElementById('patient-appointments-list');
  if (!container) return;
  container.innerHTML = '<div style="text-align:center; padding:1.5rem; color:#64748b;">Cargando tus citas...</div>';

  try {
    const res = await fetch(`${API_BASE}/clinical/patients/${patientId}/appointments`, {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    const json = await res.json();
    const apts = json.data || [];

    if (apts.length === 0) {
      container.innerHTML = `
        <div style="text-align:center; padding:2rem; color:#64748b;">
          <div style="font-size:2rem; margin-bottom:0.5rem;">📅</div>
          <p>No tienes citas médicas programadas actualmente.</p>
          <button type="button" class="btn btn-primary btn-sm" onclick="openScheduleModal()" style="margin-top:0.75rem;">Agendar Cita</button>
        </div>
      `;
      return;
    }

    container.innerHTML = apts.map(a => {
      const dateStr = new Date(a.fecha_hora).toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      const isProgrammed = a.estado === 'PROGRAMADA';

      return `
        <div style="border:1px solid var(--border); border-radius:0.5rem; padding:1rem; margin-bottom:0.75rem; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem;">
          <div>
            <div style="font-weight:700; color:var(--secondary);">${dateStr}</div>
            <div style="font-size:0.85rem; color:#334155; margin-top:0.2rem;">
              <strong>Médico:</strong> ${a.medico_nombre} (${a.especialidad})
            </div>
            <div style="font-size:0.8rem; color:#64748b;"><strong>Motivo:</strong> ${a.motivo}</div>
            <div style="margin-top:0.35rem;">
              <span class="badge ${a.modalidad === 'TELEMEDICINA' ? 'badge-purple' : 'badge-primary'}">${a.modalidad}</span>
              <span class="badge ${a.estado === 'ATENDIDA' ? 'badge-success' : a.estado === 'CANCELADA' ? 'badge-danger' : 'badge-warning'}">${a.estado}</span>
              ${a.enlace_telemedicina && isProgrammed ? `<a href="${a.enlace_telemedicina}" target="_blank" class="badge badge-purple" style="text-decoration:none;">📹 Ingresar a Videoconsulta</a>` : ''}
            </div>
          </div>
          ${isProgrammed ? `<button type="button" class="btn btn-danger btn-sm" onclick="cancelPatientAppointment('${a.id}')">Cancelar Cita</button>` : ''}
        </div>
      `;
    }).join('');
  } catch (err) {
    container.innerHTML = `<div style="color:#ef4444; padding:1rem;">Error al cargar citas: ${err.message}</div>`;
  }
}

async function loadPatientPrescriptions(patientId) {
  const container = document.getElementById('patient-prescriptions-list');
  if (!container) return;
  container.innerHTML = '<div style="text-align:center; padding:1.5rem; color:#64748b;">Cargando tus recetas...</div>';

  try {
    const res = await fetch(`${API_BASE}/clinical/patients/${patientId}/prescriptions`, {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    const json = await res.json();
    const rxs = json.data || [];

    if (rxs.length === 0) {
      container.innerHTML = '<div style="text-align:center; padding:2rem; color:#64748b;">No tienes recetas médicas emitidas actualmente.</div>';
      return;
    }

    container.innerHTML = rxs.map(rx => {
      const issueDate = new Date(rx.fecha_emision).toLocaleDateString('es-ES', { dateStyle: 'medium' });
      const expDate = new Date(rx.fecha_vencimiento).toLocaleDateString('es-ES', { dateStyle: 'medium' });

      const itemsHtml = (rx.items || []).map(it => `
        <div style="padding:0.5rem 0; border-bottom:1px solid #f1f5f9; display:flex; justify-content:space-between; align-items:center;">
          <div>
            <strong style="color:var(--secondary);">${it.medicamento}</strong> (${it.dosis})
            <div style="font-size:0.75rem; color:#64748b;">${it.frecuencia} por ${it.duracion_dias} días • Cantidad: ${it.cantidad_recetada}</div>
            ${it.instrucciones ? `<div style="font-size:0.75rem; color:#0369a1;"><em>${it.instrucciones}</em></div>` : ''}
          </div>
          <span class="badge badge-success">Válido en Farmacia</span>
        </div>
      `).join('');

      return `
        <div class="prescription-card">
          <div class="prescription-card-header">
            <div>
              <div style="font-weight:700; color:var(--secondary);">Receta Médica Electrónica Oficial</div>
              <div style="font-size:0.75rem; color:#64748b;">Emitida el: ${issueDate} • Vence el: ${expDate}</div>
            </div>
            <span class="badge badge-primary">Dr. ${rx.medico_nombre} (${rx.especialidad})</span>
          </div>
          <div style="margin-bottom:1rem;">
            ${itemsHtml}
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem; background:#f8fafc; padding:0.75rem; border-radius:0.5rem;">
            <div style="font-size:0.75rem; color:#64748b;">
              🔖 <strong>Código QR:</strong> RX-${rx.id.substring(0, 8).toUpperCase()}
            </div>
            <button type="button" class="btn btn-secondary btn-sm" onclick="printPrescription('${rx.id}')">
              🖨️ Imprimir Receta
            </button>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    container.innerHTML = `<div style="color:#ef4444; padding:1rem;">Error al cargar recetas: ${err.message}</div>`;
  }
}

async function loadPatientConsultationsHistory(patientId) {
  const container = document.getElementById('patient-consultations-list');
  if (!container) return;
  container.innerHTML = '<div style="text-align:center; padding:1.5rem; color:#64748b;">Cargando historial...</div>';

  try {
    const res = await fetch(`${API_BASE}/clinical/patients/${patientId}/consultations`, {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    const json = await res.json();
    const records = json.data || [];

    if (records.length === 0) {
      container.innerHTML = '<div style="text-align:center; padding:2rem; color:#64748b;">No tienes consultas clínicas registradas.</div>';
      return;
    }

    container.innerHTML = records.map(c => {
      const dateStr = new Date(c.fecha_consulta).toLocaleDateString('es-ES', { dateStyle: 'long' });
      const diags = (c.diagnosticos || []).map(d => `<span class="badge badge-primary">${d.codigo_cie10}: ${d.descripcion}</span>`).join(' ');

      return `
        <div style="border:1px solid var(--border); border-radius:0.5rem; padding:1.25rem; margin-bottom:1rem;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
            <span style="font-weight:700; color:var(--secondary); font-size:0.95rem;">${dateStr}</span>
            <span class="badge badge-primary">${c.doctor_nombre} (${c.especialidad})</span>
          </div>
          <div style="font-size:0.85rem; margin-bottom:0.4rem;">
            <strong>Motivo registrado:</strong> ${c.motivo_consulta}
          </div>
          <div style="font-size:0.85rem; margin-bottom:0.5rem;">
            <strong>Evolución y Plan Médico:</strong> ${c.evolucion_clinica}
          </div>
          ${diags ? `<div style="margin-top:0.5rem; display:flex; gap:0.35rem; flex-wrap:wrap;"><strong>Diagnósticos:</strong> ${diags}</div>` : ''}

          <div style="margin-top:0.75rem; padding:0.4rem 0.6rem; background:#f8fafc; border-radius:0.35rem; font-size:0.75rem; color:#64748b;">
            🔒 <em>Protección activa: Notas confidenciales y de criterio interno del facultativo purgadas por el servidor (Cumplimiento HIPAA).</em>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    container.innerHTML = `<div style="color:#ef4444; padding:1rem;">Error al cargar historial: ${err.message}</div>`;
  }
}

// ==============================================================================
// 8. PANEL DE ENFERMERÍA Y TRIAJE MANCHESTER (NURSE PORTAL)
// ==============================================================================
function showNursePortal() {
  if (!state.token || (state.user?.role !== 'NURSE' && state.user?.role !== 'ENFERMERO' && state.user?.role !== 'ADMIN')) {
    navigateTo('nurse');
    return;
  }

  document.getElementById('view-landing').classList.add('hidden');
  document.getElementById('view-role-login').classList.add('hidden');
  document.getElementById('view-dashboard').classList.add('hidden');
  document.getElementById('view-patient').classList.add('hidden');
  document.getElementById('view-admin').classList.add('hidden');
  document.getElementById('view-nurse').classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });

  renderTriageTable();
}

window.handleNurseSaveTriage = function(e) {
  e.preventDefault();
  const patientFull = document.getElementById('triage-patient-select').value;
  const pa = document.getElementById('triage-pa').value;
  const fc = document.getElementById('triage-fc').value;
  const temp = document.getElementById('triage-temp').value;
  const spo2 = document.getElementById('triage-spo2').value;
  const level = document.getElementById('triage-level').value;
  const box = document.getElementById('triage-box').value;
  const obs = document.getElementById('triage-obs').value;

  const patientParts = patientFull.split(' - ');
  const patientName = patientParts[0] || 'Paciente';
  const patientCi = patientParts[1] || 'CI-4589214';

  const newRecord = {
    patient: patientName,
    ci: patientCi,
    blood: 'O+',
    pa,
    fc,
    spo2,
    temp,
    level,
    levelText: `NIVEL: ${level}`,
    box,
    status: 'En Espera Médico'
  };

  state.triageRecords.unshift(newRecord);
  renderTriageTable();

  const countEl = document.getElementById('nurse-kpi-evaluated');
  if (countEl) countEl.textContent = state.triageRecords.length;

  showToast(`✅ Signos vitales y Triaje ${level} registrados exitosamente para ${patientName}.`);
};

function renderTriageTable() {
  const tbody = document.getElementById('nurse-triage-table-body');
  if (!tbody) return;

  tbody.innerHTML = state.triageRecords.map(r => {
    const badgeClass = r.level === 'ROJO' ? 'badge-danger' :
                       r.level === 'NARANJA' ? 'badge-warning' :
                       r.level === 'AMARILLO' ? 'badge-warning' :
                       r.level === 'VERDE' ? 'badge-success' : 'badge-primary';

    return `
      <tr>
        <td><strong>${r.patient}</strong><br><small>${r.ci} • ${r.blood}</small></td>
        <td style="font-size:0.75rem;">PA: ${r.pa}<br>FC: ${r.fc} • SpO2: ${r.spo2} • Temp: ${r.temp}</td>
        <td><span class="badge ${badgeClass}">${r.levelText}</span></td>
        <td>${r.box}</td>
        <td><span class="badge badge-success">${r.status}</span></td>
      </tr>
    `;
  }).join('');
}

// ==============================================================================
// 9. PANEL ADMINISTRATIVO & AUDITORÍA HIPAA (ADMIN PORTAL)
// ==============================================================================
function showAdminPortal() {
  if (!state.token || state.user?.role !== 'ADMIN') {
    navigateTo('admin');
    return;
  }

  document.getElementById('view-landing').classList.add('hidden');
  document.getElementById('view-role-login').classList.add('hidden');
  document.getElementById('view-dashboard').classList.add('hidden');
  document.getElementById('view-patient').classList.add('hidden');
  document.getElementById('view-nurse').classList.add('hidden');
  document.getElementById('view-admin').classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });

  loadAdminAuditLogs();
}

window.loadAdminAuditLogs = async function() {
  const tbody = document.getElementById('admin-audit-table-body');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:1.5rem; color:#64748b;">Consultando registros de auditoría en Supabase...</td></tr>';

  try {
    const res = await fetch(`${API_BASE}/clinical/admin/audit-logs`, {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });

    const json = await res.json();
    state.auditLogs = json.data || [];

    const kpiEl = document.getElementById('admin-kpi-logs');
    if (kpiEl) kpiEl.textContent = state.auditLogs.length;

    if (state.auditLogs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:1.5rem; color:#64748b;">Sin registros de auditoría en este periodo.</td></tr>';
      return;
    }

    tbody.innerHTML = state.auditLogs.map(log => {
      const dateStr = new Date(log.fecha_evento || log.timestamp).toLocaleString('es-ES');
      const actionBadge = log.accion === 'LOGIN' || log.accion === 'LOGIN_SUCCESS' ? 'badge-primary' : 
                          log.accion === 'CREATE' ? 'badge-success' : 
                          log.accion === 'READ' ? 'badge-smc' : 'badge-warning';

      return `
        <tr>
          <td><span style="font-family:monospace; font-size:0.8rem;">${dateStr}</span></td>
          <td><strong>${log.email_usuario || log.actorEmail || 'Sistema'}</strong></td>
          <td><span class="badge badge-purple">${log.rol_usuario || log.actorRole || 'N/A'}</span></td>
          <td><span class="badge ${actionBadge}">${log.accion || log.action}</span></td>
          <td><strong>${log.recurso || log.resource}</strong></td>
          <td><span style="font-family:monospace; font-size:0.8rem; color:#64748b;">${log.ip_origen || log.ipAddress || '127.0.0.1'}</span></td>
          <td style="font-size:0.75rem; color:#475569; max-width:260px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
            ${typeof log.detalles === 'object' ? JSON.stringify(log.detalles) : (log.detalles || 'Evento estándar')}
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="color:#ef4444; padding:1rem; text-align:center;">Error al consultar auditoría: ${err.message}</td></tr>`;
  }
};

// ==============================================================================
// 10. GESTIÓN DE CITAS Y RECETAS
// ==============================================================================
window.openScheduleModal = function() {
  document.getElementById('modal-schedule').classList.remove('hidden');
  const now = new Date();
  now.setDate(now.getDate() + 1);
  now.setHours(10, 0, 0, 0);
  const isoLocal = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  document.getElementById('schedule-date').value = isoLocal;
};

window.closeScheduleModal = function() {
  document.getElementById('modal-schedule').classList.add('hidden');
};

async function handleScheduleAppointment(e) {
  e.preventDefault();
  const doctorId = document.getElementById('schedule-doctor').value;
  const appointmentDate = document.getElementById('schedule-date').value;
  const modality = document.getElementById('schedule-modality').value;
  const reason = document.getElementById('schedule-reason').value.trim();
  const btnSubmit = document.getElementById('btn-submit-appointment');
  const patientId = state.user?.patientId || 'c0000000-0000-0000-0000-000000000001';

  btnSubmit.disabled = true;
  btnSubmit.textContent = 'Agendando en Supabase...';

  try {
    const res = await fetch(`${API_BASE}/clinical/appointments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': state.token ? `Bearer ${state.token}` : ''
      },
      body: JSON.stringify({
        patientId,
        doctorId,
        appointmentDate,
        modality,
        reason
      })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Error al programar cita.');
    }

    closeScheduleModal();
    showToast('🎉 ¡Cita médica agendada con éxito en Supabase!');

    if (state.user?.role === 'PATIENT') {
      await loadPatientAppointments(patientId);
    }
  } catch (err) {
    alert(err.message);
  } finally {
    btnSubmit.disabled = false;
    btnSubmit.textContent = 'Confirmar Cita Médica';
  }
}

window.cancelPatientAppointment = async function(appointmentId) {
  if (!confirm('¿Estás seguro de que deseas cancelar esta cita médica?')) return;

  try {
    const res = await fetch(`${API_BASE}/clinical/appointments/${appointmentId}/cancel`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Error al cancelar.');
    }

    showToast('Cita cancelada correctamente.');
    const patientId = state.user?.patientId || 'c0000000-0000-0000-0000-000000000001';
    await loadPatientAppointments(patientId);
  } catch (err) {
    alert(err.message);
  }
};

window.printPrescription = function(rxId) {
  window.print();
};

// ==============================================================================
// 11. CARRUSEL Y BÚSQUEDA PÚBLICA
// ==============================================================================
function initSlider() {
  const track = document.getElementById('slider-track');
  if (!track) return;
  if (state.slideInterval) clearInterval(state.slideInterval);
  state.slideInterval = setInterval(() => {
    nextSlide();
  }, 7000);
}

window.goToSlide = function(index) {
  state.currentSlide = index;
  const track = document.getElementById('slider-track');
  if (track) {
    track.style.transform = `translateX(-${state.currentSlide * 100}%)`;
  }
  const dots = document.querySelectorAll('.slider-dot');
  dots.forEach((dot, idx) => {
    if (idx === state.currentSlide) dot.classList.add('active');
    else dot.classList.remove('active');
  });
};

window.nextSlide = function() {
  const totalSlides = 3;
  state.currentSlide = (state.currentSlide + 1) % totalSlides;
  goToSlide(state.currentSlide);
};

window.prevSlide = function() {
  const totalSlides = 3;
  state.currentSlide = (state.currentSlide - 1 + totalSlides) % totalSlides;
  goToSlide(state.currentSlide);
};

async function loadDoctorsList() {
  try {
    const res = await fetch(`${API_BASE}/clinical/doctors`, {
      headers: state.token ? { 'Authorization': `Bearer ${state.token}` } : {}
    });
    if (res.ok) {
      const json = await res.json();
      state.doctorsList = json.data || [];
    }
  } catch (e) {
    console.warn('Usando lista de médicos predeterminada');
    state.doctorsList = [
      { id: 'b0000000-0000-0000-0000-000000000001', nombre_completo: 'Alejandro Mendoza', especialidad: 'Cardiología', departamento: 'Consultas Externas' },
      { id: 'b0000000-0000-0000-0000-000000000002', nombre_completo: 'Claudia Soliz', especialidad: 'Medicina General', departamento: 'Consultas Externas' },
      { id: 'b0000000-0000-0000-0000-000000000003', nombre_completo: 'Roberto Paz', especialidad: 'Pediatría', departamento: 'Materno-Infantil' }
    ];
  }
  renderDoctorSearchResults(state.doctorsList);
  populateDoctorSelect();
}

function populateDoctorSelect() {
  const select = document.getElementById('schedule-doctor');
  if (select && state.doctorsList.length > 0) {
    select.innerHTML = state.doctorsList.map(d => `
      <option value="${d.id}">${d.nombre_completo} - ${d.especialidad} (${d.departamento})</option>
    `).join('');
  }
}

window.handlePublicSearch = function(e) {
  e.preventDefault();
  const specialty = document.getElementById('search-specialty-select').value.toLowerCase();
  const term = document.getElementById('search-doctor-input').value.trim().toLowerCase();

  const filtered = state.doctorsList.filter(d => {
    const matchesSpec = !specialty || d.especialidad.toLowerCase().includes(specialty);
    const matchesTerm = !term || d.nombre_completo.toLowerCase().includes(term) || d.especialidad.toLowerCase().includes(term);
    return matchesSpec && matchesTerm;
  });

  renderDoctorSearchResults(filtered);
};

window.setSearchFilter = function(category) {
  document.querySelectorAll('.search-tab').forEach(t => t.classList.remove('active'));
  const clickedTab = Array.from(document.querySelectorAll('.search-tab')).find(t => t.textContent.toLowerCase().includes(category.toLowerCase()) || (category === 'all' && t.textContent.includes('Buscar')));
  if (clickedTab) clickedTab.classList.add('active');

  const select = document.getElementById('search-specialty-select');
  if (category === 'all') {
    select.value = '';
    renderDoctorSearchResults(state.doctorsList);
  } else if (category === 'telemed') {
    document.getElementById('search-modality-select').value = 'TELEMEDICINA';
    renderDoctorSearchResults(state.doctorsList);
  } else {
    select.value = category;
    const filtered = state.doctorsList.filter(d => d.especialidad.toLowerCase().includes(category.toLowerCase()));
    renderDoctorSearchResults(filtered);
  }
};

function renderDoctorSearchResults(doctors) {
  const container = document.getElementById('doctor-cards-list');
  if (!container) return;

  if (!doctors || doctors.length === 0) {
    container.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:2rem; color:#64748b;">No se encontraron especialistas.</div>';
    return;
  }

  container.innerHTML = doctors.map(d => `
    <div class="doctor-card">
      <div class="doctor-card-avatar">👨‍⚕️</div>
      <div style="flex-grow:1;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <h4 style="font-size:1.05rem; font-weight:800; color:#004b93;">Dr(a). ${d.nombre_completo}</h4>
          <span class="badge badge-smc">${d.especialidad}</span>
        </div>
        <div style="font-size:0.8rem; color:#64748b; margin-top:0.2rem;">Departamento: ${d.departamento}</div>
        <div style="font-size:0.75rem; color:#059669; font-weight:600; margin-top:0.35rem;">🟢 Citas Disponibles Hoy</div>
        <div style="margin-top:0.75rem; display:flex; gap:0.5rem;">
          <button type="button" class="btn btn-smc btn-sm" onclick="openScheduleDoctor('${d.id}')">
            📅 Agendar Cita
          </button>
          <button type="button" class="btn btn-secondary btn-sm" onclick="openTelemedicineQuick()">
            📹 Telemedicina
          </button>
        </div>
      </div>
    </div>
  `).join('');
}

window.openScheduleDoctor = function(doctorIdOrSpecialty) {
  openScheduleModal();
  const select = document.getElementById('schedule-doctor');
  if (select) {
    const option = Array.from(select.options).find(o => o.value === doctorIdOrSpecialty || o.text.includes(doctorIdOrSpecialty));
    if (option) select.value = option.value;
  }
};

window.openTelemedicineQuick = function() {
  openScheduleModal();
  const modSelect = document.getElementById('schedule-modality');
  if (modSelect) modSelect.value = 'TELEMEDICINA';
  showToast('📹 Modalidad Telemedicina activada. Selecciona la fecha de tu videoconsulta.');
};

function showToast(message) {
  const toast = document.getElementById('toast-notification');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.remove('hidden');
  setTimeout(() => {
    toast.classList.add('hidden');
  }, 4500);
}

// ==============================================================================
// 12. MÓDULO DE ADMISIÓN Y REGISTRO CLÍNICO DE PACIENTES NUEVOS
// ==============================================================================
window.openAdmissionModal = function() {
  // Restricción estricta: Solo el personal de Enfermería puede registrar y admitir pacientes
  if (!state.user || (state.user.role !== 'NURSE' && state.user.role !== 'ADMIN')) {
    showRoleLoginView('nurse', 'Acceso restringido: El módulo de registro, admisión y triaje de pacientes está reservado estrictamente para el personal de Enfermería.');
    return;
  }

  const modal = document.getElementById('modal-patient-admission');
  if (modal) {
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    loadDoctorsForAdmission();
  }
};

window.closeAdmissionModal = function() {
  const modal = document.getElementById('modal-patient-admission');
  if (modal) {
    modal.classList.add('hidden');
    modal.style.display = 'none';
  }
};

window.handleAdmissionDobChange = function(dobString) {
  const ageDisplay = document.getElementById('adm-age-display');
  if (!ageDisplay || !dobString) return;

  const dob = new Date(dobString);
  const today = new Date();
  
  if (isNaN(dob.getTime())) {
    ageDisplay.textContent = 'Edad: Fecha inválida';
    return;
  }

  let years = today.getFullYear() - dob.getFullYear();
  let m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
    years--;
  }

  if (years < 0) {
    ageDisplay.textContent = 'Edad: Fecha en el futuro';
  } else if (years === 0) {
    let months = (today.getFullYear() - dob.getFullYear()) * 12 + (today.getMonth() - dob.getMonth());
    if (today.getDate() < dob.getDate()) months--;
    ageDisplay.textContent = `Edad: ${Math.max(0, months)} meses (Lactante)`;
  } else {
    ageDisplay.textContent = `Edad: ${years} años`;
  }
};

window.calculateAdmissionBmi = function() {
  const weightInput = document.getElementById('adm-weight');
  const heightInput = document.getElementById('adm-height');
  const badge = document.getElementById('adm-bmi-badge');
  if (!badge) return;

  const weight = parseFloat(weightInput?.value);
  const height = parseFloat(heightInput?.value);

  if (!weight || !height || height <= 0 || weight <= 0) {
    badge.className = 'badge badge-primary';
    badge.textContent = 'IMC: Ingrese peso y talla';
    return;
  }

  const heightM = height / 100;
  const bmi = (weight / (heightM * heightM)).toFixed(1);

  if (bmi < 18.5) {
    badge.className = 'badge badge-warning';
    badge.textContent = `IMC: ${bmi} kg/m² • Bajo Peso (Desnutrición)`;
  } else if (bmi < 25) {
    badge.className = 'badge badge-success';
    badge.textContent = `IMC: ${bmi} kg/m² • Peso Normal (Saludable)`;
  } else if (bmi < 30) {
    badge.className = 'badge badge-warning';
    badge.textContent = `IMC: ${bmi} kg/m² • Sobrepeso (Riesgo Moderado)`;
  } else if (bmi < 35) {
    badge.className = 'badge badge-danger';
    badge.textContent = `IMC: ${bmi} kg/m² • Obesidad Grado I`;
  } else {
    badge.className = 'badge badge-danger';
    badge.textContent = `IMC: ${bmi} kg/m² • Obesidad Severa / Mórbida`;
  }
};

window.handleAdmissionAllergyWarning = function(allergyVal) {
  const alertBox = document.getElementById('adm-allergy-alert');
  if (!alertBox) return;

  const trimmed = allergyVal.trim().toLowerCase();
  if (trimmed.length > 0 && trimmed !== 'ninguna' && trimmed !== 'niega' && trimmed !== 'no') {
    alertBox.classList.remove('hidden');
    alertBox.innerHTML = `🚨 <strong>Alergia Detectada:</strong> Se activará el protocolo de seguridad y brazalete de alerta farmacológica.`;
  } else {
    alertBox.classList.add('hidden');
  }
};

window.filterDoctorsBySpecialty = function(specialty) {
  const doctorSelect = document.getElementById('adm-doctor');
  if (!doctorSelect) return;

  Array.from(doctorSelect.options).forEach(opt => {
    if (opt.text.toLowerCase().includes(specialty.toLowerCase())) {
      opt.selected = true;
    }
  });
};

async function loadDoctorsForAdmission() {
  const select = document.getElementById('adm-doctor');
  if (!select) return;

  try {
    const res = await fetch(`${API_BASE}/clinical/doctors`);
    if (res.ok) {
      const data = await res.json();
      if (data.data && data.data.length > 0) {
        select.innerHTML = data.data.map(d => `
          <option value="${d.id}">${d.nombre_completo} (${d.especialidad})</option>
        `).join('');
      }
    }
  } catch (e) {
    console.warn('Usando lista de médicos inicial:', e);
  }
}

window.handlePatientAdmissionSubmit = async function(event) {
  event.preventDefault();
  const btn = document.getElementById('btn-save-admission');
  if (btn) btn.disabled = true;

  const weight = parseFloat(document.getElementById('adm-weight')?.value);
  const height = parseFloat(document.getElementById('adm-height')?.value);
  let bmi = null;
  if (weight && height && height > 0) {
    const heightM = height / 100;
    bmi = parseFloat((weight / (heightM * heightM)).toFixed(1));
  }

  const payload = {
    // 1. Identificación y Admisión
    firstName: document.getElementById('adm-first-name')?.value,
    lastName: document.getElementById('adm-last-name')?.value,
    nationalId: document.getElementById('adm-national-id')?.value,
    dateOfBirth: document.getElementById('adm-dob')?.value,
    biologicalSex: document.getElementById('adm-sex')?.value || 'Masculino',
    genderIdentity: document.getElementById('adm-sex')?.value || 'Masculino',
    phone: document.getElementById('adm-phone')?.value,
    email: document.getElementById('adm-email')?.value,
    address: document.getElementById('adm-address')?.value,
    insuranceProvider: document.getElementById('adm-insurance')?.value,
    emergencyContactName: document.getElementById('adm-emerg-name')?.value,
    emergencyContactRelationship: document.getElementById('adm-emerg-rel')?.value,
    emergencyContactPhone: document.getElementById('adm-emerg-phone')?.value,

    // 2. Motivo y Signos Vitales (Triaje)
    reason: document.getElementById('adm-reason')?.value,
    bloodPressure: document.getElementById('adm-bp')?.value,
    heartRate: document.getElementById('adm-hr')?.value ? parseInt(document.getElementById('adm-hr').value, 10) : null,
    respiratoryRate: document.getElementById('adm-rr')?.value ? parseInt(document.getElementById('adm-rr').value, 10) : null,
    temperature: document.getElementById('adm-temp')?.value ? parseFloat(document.getElementById('adm-temp').value) : null,
    oxygenSaturation: document.getElementById('adm-spo2')?.value ? parseFloat(document.getElementById('adm-spo2').value) : null,
    weightKg: weight || null,
    heightCm: height || null,
    bmi: bmi,

    // 3. Antecedentes (Anamnesis)
    criticalAllergies: document.getElementById('adm-allergies')?.value,
    chronicConditions: document.getElementById('adm-chronic')?.value,
    currentMedications: document.getElementById('adm-meds')?.value,
    surgicalHistory: document.getElementById('adm-surgeries')?.value,
    familyHistory: document.getElementById('adm-family')?.value,

    // 4. Asignación y Destino
    specialty: document.getElementById('adm-specialty')?.value,
    doctorId: document.getElementById('adm-doctor')?.value,
    status: document.getElementById('adm-status')?.value
  };

  try {
    const res = await fetch(`${API_BASE}/clinical/patients/admission`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(state.token ? { 'Authorization': `Bearer ${state.token}` } : {})
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (res.ok && data.success) {
      closeAdmissionModal();
      document.getElementById('form-patient-admission')?.reset();
      showToast(`🎉 Paciente ${payload.firstName} ${payload.lastName} (${payload.nationalId}) admitido exitosamente en el Hospital de Santa Fe.`);
      
      if (state.user && state.user.role === 'DOCTOR') {
        loadDoctorAppointments();
      }
    } else {
      alert('Error en admisión: ' + (data.message || 'Error al procesar la solicitud.'));
    }
  } catch (err) {
    console.error('Error al admitir paciente:', err);
    alert('Error de conexión al registrar la admisión.');
  } finally {
    if (btn) btn.disabled = false;
  }
};
