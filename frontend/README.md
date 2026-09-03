# Frontend del Sistema de Gestión Hospitalaria (HMS / EMR)

Arquitectura recomendada: **Next.js 14+ (App Router) o React + Vite con TypeScript y TailwindCSS**.

## Estructura de Carpetas Sugerida (Frontend)

```text
frontend/
├── public/
│   ├── favicon.ico
│   └── assets/medical-icons/
├── src/
│   ├── app/ (o pages/)
│   │   ├── layout.tsx                    # Layout raíz con AuthProvider y QueryClientProvider
│   │   ├── page.tsx                      # Landing / Redirección según rol
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx            # Login con selección/detección automática de rol y MFA
│   │   │   └── register/page.tsx         # Auto-registro de pacientes
│   │   ├── (portal-paciente)/            # Vistas exclusivas para PACIENTES
│   │   │   ├── layout.tsx                # Layout con navegación del paciente
│   │   │   ├── dashboard/page.tsx        # Próximas citas, recordatorios, estado de salud
│   │   │   ├── citas/page.tsx            # Agendar, reprogramar o cancelar citas (presencial/telemedicina)
│   │   │   ├── recetas/page.tsx          # Recetas vigentes, instrucciones y código QR para farmacia
│   │   │   ├── resultados/page.tsx       # Resultados de laboratorio e imágenes médicas descargables
│   │   │   └── pagos/page.tsx            # Historial de consultas y comprobantes de pago
│   │   ├── (portal-medico)/              # Vistas para MÉDICOS y ENFERMEROS
│   │   │   ├── layout.tsx                # Layout clínico (Sidebar con turnos del día)
│   │   │   ├── agenda/page.tsx           # Agenda diaria de citas asignadas
│   │   │   ├── triaje/page.tsx           # Módulo de Urgencias (Manchester / Clasificación por colores)
│   │   │   ├── consulta/[citaId]/page.tsx# Registro EHR: Anamnesis, CIE-10/11, Receta y Órdenes
│   │   │   ├── hospitalizacion/page.tsx  # Censo de camas, evolución y cuidados intensivos (UCI)
│   │   │   └── notas-privadas/           # Componente con acceso exclusivo a anotaciones confidenciales
│   │   ├── (portal-auxiliares)/          # SERVICIOS AUXILIARES
│   │   │   ├── laboratorio/page.tsx      # Órdenes pendientes, carga de resultados y parámetros
│   │   │   ├── radiologia/page.tsx       # Carga de informes e imágenes diagnósticas
│   │   │   └── farmacia/page.tsx         # Validación de recetas electrónicas y dispensación
│   │   └── (portal-admin)/               # ADMINISTRACIÓN Y TI
│   │       ├── admision/page.tsx         # Alta rápida de pacientes, asignación de salas de espera
│   │       ├── caja/page.tsx             # Facturación y cobro
│   │       ├── usuarios/page.tsx         # Gestión RBAC de personal de salud y accesos
│   │       └── auditoria/page.tsx        # Visor de Audit Logs (Cumplimiento HIPAA / GDPR)
│   ├── components/
│   │   ├── ui/                           # Botones, Modales, Badges de Triaje, Inputs accesibles
│   │   ├── clinical/                     # Selector CIE-10/11, Visualizador de Signos Vitales
│   │   └── layout/                       # Header, Sidebar dinámico según rol
│   ├── context/
│   │   └── AuthContext.tsx               # Contexto React para estado de sesión, permisos y token
│   ├── hooks/
│   │   ├── useAuth.ts                    # Hook de sesión activa y comprobación de roles
│   │   └── usePermissions.ts             # Hook 'can(Permission.EHR_CREATE)' para render condicional
│   ├── lib/
│   │   ├── api.ts                        # Cliente Axios configurado con interceptores JWT y auto-refresh
│   │   └── formatters.ts                 # Formateo de fechas, presión arterial y diagnósticos
│   └── types/
│       └── emr.types.ts                  # Tipos TypeScript sincronizados con el backend
├── package.json
└── tailwind.config.js
```

## Reglas de Renderizado Seguro en UI (Seguridad de Lado del Cliente)
1. **Ocultación Dinámica por Rol**: Elementos como botones de diagnóstico, órdenes o notas privadas del médico no se renderizan en la interfaz del paciente.
2. **Double-Check en Backend**: La UI solo mejora la UX; todas las operaciones sensibles son validadas en el servidor mediante el middleware `rbac.middleware.ts`.
3. **Manejo Seguro de Sesión**: Los JWT se guardan en cookies `HttpOnly; Secure; SameSite=Strict` o memoria con renovación silenciosa para prevenir ataques XSS.
