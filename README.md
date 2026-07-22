# Closer CRM

Panel interno de gestión de riders (repartidores) para Closer Logistics: incidencias, ausencias, métricas operativas, horas extra y administración de flota. Aplicación 100% en español, con soporte parcial de inglés (ver sección de idiomas).

## Stack

- **[Next.js 14](https://nextjs.org/)** (App Router) + TypeScript + Tailwind CSS
- **[Supabase](https://supabase.com/)**: base de datos PostgreSQL, autenticación, Row Level Security (RLS) y Realtime
- **[Vercel](https://vercel.com/)**: hosting y despliegue continuo

La aplicación no tiene backend propio aparte de las Server Actions de Next.js: toda la lógica de negocio vive en el propio proyecto, y Supabase actúa como base de datos y proveedor de autenticación.

## Arquitectura general

```
┌─────────────────────────────────────────────────────────┐
│  Next.js (Vercel)                                        │
│  ├─ /rider/*      → app para riders (móvil primero)       │
│  ├─ /gestor/*     → login de administradores               │
│  └─ /dashboard/*  → panel de administración                │
└───────────────┬─────────────────┬────────────────────────┘
                │                 │
      ┌─────────▼────────┐  ┌─────▼──────────────────────┐
      │  Supabase          │  │  APIs externas               │
      │  - PostgreSQL + RLS │  │  - Fleet Manager (métricas)   │
      │  - Auth             │  │  - Google Drive (archivos)     │
      │  - Realtime         │  │                                │
      └────────────────────┘  └────────────────────────────────┘
```

Todos los roles (rider, gestor/administrador) usan el mismo mecanismo de autenticación de Supabase Auth. La autorización — quién puede ver o modificar qué — se resuelve con **Row Level Security** en PostgreSQL, no en el código de la aplicación: cada tabla tiene políticas que filtran las filas según el rol y la zona (ciudad) del usuario autenticado.

## Roles

- **Rider**: accede con DNI + contraseña. Reporta incidencias y ausencias, ve sus propias métricas operativas.
- **Moderador / Administrador**: gestionan riders, incidencias y ausencias de las ciudades que tengan asignadas.
- **Super Admin**: acceso total, sin restricción de zona; gestiona catálogos, usuarios y configuración global.

## 1. Requisitos previos

- Node.js 18+
- Una cuenta de [Supabase](https://supabase.com/) (proyecto nuevo)
- Una cuenta de [Vercel](https://vercel.com/) para el despliegue
- Credenciales de las APIs externas (ver sección 3)

## 2. Base de datos (Supabase)

1. Crea un proyecto nuevo en Supabase.
2. Ve a **SQL Editor** → *New query*, pega el contenido completo de `supabase/schema.sql` y ejecútalo. Crea todas las tablas, políticas de seguridad y datos de catálogo (ciudades, centros, motivos, vehículos).
3. Crea el primer usuario administrador:
   - **Authentication → Users → Add user** (email + contraseña).
   - Copia su UUID y ejecuta en el SQL Editor:
     ```sql
     insert into admins (auth_user_id, usuario, rol, acceso_panel)
     values ('<uuid-del-usuario>', 'tu_usuario', 'super_admin', true);
     ```

## 3. Variables de entorno

Copia `.env.local.example` a `.env.local` y rellena:

| Variable | Descripción |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto de Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clave anónima (pública) de Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave de servicio (secreta, solo servidor) |
| `NEXT_PUBLIC_SITE_URL` | URL pública del sitio desplegado |
| `OVERTIME_API_USERNAME` / `OVERTIME_API_PASSWORD` | Credenciales de la API externa de horas extra / CH vs WH |
| `FLEET_MANAGER_USERNAME` / `FLEET_MANAGER_PASSWORD` | Credenciales de la API de métricas operativas (Fleet Manager) |
| `GOOGLE_DRIVE_CLIENT_ID` / `GOOGLE_DRIVE_CLIENT_SECRET` / `GOOGLE_DRIVE_REFRESH_TOKEN` | Credenciales OAuth para guardar archivos adjuntos en Google Drive |
| `GOOGLE_DRIVE_FOLDER_ID` | ID de la carpeta raíz de Drive donde se guardan los archivos |

**Nunca** pongas estos valores directamente en el código: en Vercel se configuran en Settings → Environment Variables.

### Google Drive — cómo generar las credenciales

Los archivos adjuntos (capturas de incidencias, justificantes de ausencias) se guardan en una carpeta de Google Drive, usando credenciales OAuth propias:

1. Crea un proyecto en [Google Cloud Console](https://console.cloud.google.com/) con cualquier cuenta de Google.
2. Habilita la **Google Drive API** (APIs y servicios → Biblioteca).
3. Configura la pantalla de consentimiento OAuth (tipo Externo).
4. Crea un **ID de cliente de OAuth** (tipo "Aplicación web"), con `https://developers.google.com/oauthplayground` como URI de redirección autorizado.
5. Comparte la carpeta raíz de Drive (donde se guardarán los archivos) con la cuenta de Google que vas a usar, con permiso **Editor**.
6. Usa [OAuth Playground](https://developers.google.com/oauthplayground/) con tus propias credenciales (icono de engranaje → *Use your own OAuth credentials*) para autorizar el scope `https://www.googleapis.com/auth/drive` y obtener un `refresh_token`.
7. Copia el ID de la carpeta raíz desde su URL de Drive.

La aplicación renueva su `access_token` automáticamente usando estas credenciales; no requiere ningún proceso externo.

## 4. Desarrollo local

```bash
npm install
npm run dev
```

## 5. Desplegar en Vercel

1. Importa el repositorio en Vercel.
2. Configura las variables de entorno (sección 3).
3. Deploy. Cada push a la rama principal despliega automáticamente.

## 6. Estructura del proyecto

```
app/
├── rider/          → login y dashboard del rider
├── gestor/         → login de administradores
├── dashboard/      → panel de administración (riders, incidencias, ausencias, métricas, configuración...)
└── api/            → rutas API (servir archivos de Drive)

components/
├── rider/          → formularios y paneles del rider
├── dashboard/       → componentes del panel de administración
├── config/         → edición de catálogos (centros, motivos, admins...)
└── ui/             → componentes básicos reutilizables

lib/
├── supabase/          → clientes de Supabase (browser, server, admin)
├── fleetManagerApi.ts → cliente de la API de métricas operativas
├── googleDrive.ts     → cliente de Google Drive
└── validations.ts     → esquemas de validación (Zod)

supabase/
└── schema.sql        → esquema completo de la base de datos
```

## 7. Funcionalidades principales

- **Incidencias y ausencias**: los riders reportan desde su móvil (con fotos/justificantes guardados en Google Drive); los administradores aprueban o rechazan, con notificaciones en tiempo real al rider.
- **Métricas operativas**: conexión, aceptación, cancelación y viajes por rider, obtenidos en vivo de la API de Fleet Manager, con vista diaria y semanal.
- **Horas extra / CH vs WH**: integración con la API externa de rendimiento, con exportación a Excel.
- **Gestión de riders**: alta individual o importación masiva desde Excel, edición, activación/desactivación y eliminación completa (incluyendo su acceso de autenticación).
- **Zonas y roles**: cada administrador/moderador ve y gestiona solo las ciudades que tenga asignadas; el Super Admin no tiene restricción.
- **Auditoría**: registro de las acciones administrativas, filtrado por zona, con retención de 6 meses.
- **Anuncios**: mensajes globales o por ciudad, dirigidos a todos, solo administradores o solo riders.
