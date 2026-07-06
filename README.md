# Closer Logistics — Panel (Next.js + Supabase)

Sustituye al CRM anterior en Google Apps Script. Dos portales:

- **`/dashboard`** — panel de administración.
- **`/rider/dashboard`** — portal del rider.

Para el manual de uso día a día (cómo reportar una incidencia, cómo
aprobarla, etc.), abre `docs/instructivo_closer_logistics.pdf`. Este
README es la parte técnica: instalación y despliegue.

## 1. Requisitos previos

- Node.js 20 o superior
- Una cuenta en [supabase.com](https://supabase.com) (plan gratuito para
  empezar; en producción real con volumen alto conviene Pro — ver nota
  de coste en el instructivo)
- Una cuenta en [vercel.com](https://vercel.com) para el despliegue

## 2. Configurar Supabase

1. Crea un proyecto nuevo en Supabase.
2. Ve a **SQL Editor** y ejecuta, en este orden (cada uno es una consulta
   aparte, dale a "Run" y espera a que termine antes de pasar al siguiente):
   1. `supabase/schema_supabase.sql`
   2. `supabase/schema_final.sql`
   3. `supabase/schema_mejoras_1.sql`
   4. `supabase/schema_mejoras_2.sql`

   Los pasos 3 y 4 van separados a propósito (una limitación de Postgres:
   no se puede usar un valor nuevo de un tipo `enum` en la misma
   transacción en la que se crea).
3. Ve a **Authentication → Users** y crea tu primer usuario administrador
   (email + contraseña). Copia su UUID (click en el usuario).
4. Vuelve a **SQL Editor** y ejecuta (sustituyendo el UUID y el usuario):

   ```sql
   insert into admins (auth_user_id, usuario, rol, acceso_panel)
   values ('<uuid-del-usuario>', 'tu_usuario', 'super_admin', true);
   ```

5. Entra a `/dashboard/configuracion` y da de alta tus centros y
   vehículos reales.
6. Da de alta a tus riders desde `/dashboard/riders` (uno a uno o en
   lote). Se crean con acceso automático, sin pasos extra.

### Dónde sacar las claves (API Keys)

Ve a **Project Settings → API Keys**:

- Si ves una pestaña **"Legacy API Keys"**: usa `anon` para
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `service_role` para
  `SUPABASE_SERVICE_ROLE_KEY`.
- Si tu proyecto es nuevo y solo tiene **"Publishable and secret API
  keys"**: usa la **Publishable key** (`sb_publishable_...`) para
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, y la **Secret key** (`sb_secret_...`)
  para `SUPABASE_SERVICE_ROLE_KEY`. Funcionan exactamente igual.

Un "Invalid API key" casi siempre significa que se han intercambiado
estas dos, o que la variable no se guardó en Vercel (hay que volver a
desplegar después de añadir/editar variables de entorno).

## 3. Variables de entorno

Copia `.env.local.example` a `.env.local` y rellena los 3 valores.
Solo son de Supabase — no hace falta ninguna cuenta ni credencial de
Google para nada de esto.

## 4. Desarrollo local

```bash
npm install
npm run dev
```

## 5. Desplegar en Vercel

1. Sube el proyecto a un repo de GitHub/GitLab.
2. En Vercel, importa el repo.
3. En **Settings → Environment Variables**, añade las 3 variables.
4. Despliega.

## 6. Mapa de URLs para hacer pruebas

Sustituye `localhost:3000` por tu dominio de Vercel cuando despliegues.

| URL | Quién entra | Qué hace |
|---|---|---|
| `/` , `/login` , `/panel` | Rider (por defecto) | Todos redirigen al login del rider |
| `/rider/login` | Rider | Iniciar sesión (email + DNI) |
| `/rider/dashboard` | Rider | Reportar incidencia / comunicar ausencia |
| `/gestor/login` | Admin | Iniciar sesión (email + contraseña) — URL no enlazada desde ningún sitio |
| `/dashboard` | Admin | Resumen con estadísticas en vivo |
| `/dashboard/incidencias` | Admin | Listado, filtros, aprobar/rechazar/editar |
| `/dashboard/ausencias` | Admin | Ausencias comunicadas por riders |
| `/dashboard/riders` | Admin | Alta individual y masiva de riders |
| `/dashboard/reportes` | Admin | Gráficos de rendimiento y motivos |
| `/dashboard/auditoria` | Admin | Quién aprobó, rechazó, editó o creó cada cosa |
| `/dashboard/papelera` | Admin | Incidencias eliminadas, recuperables |
| `/dashboard/configuracion` | Super Admin | Catálogos, anuncio global, alta de admins |

`/gestor/login` es comodidad, no seguridad real (cualquiera puede ver esa
ruta en el código fuente público de la web). Lo que protege el panel es
la contraseña + que la cuenta exista en la tabla `admins`. Puedes
renombrar la carpeta `app/gestor/login` a lo que prefieras si quieres
una ruta menos adivinable.

No hay URL para "crear el primer admin": eso se hace una vez, a mano,
en el SQL Editor (paso 2.4).

## 7. Qué incluye esta versión

- Panel admin completo: resumen en vivo, incidencias con filtros,
  paginación (10 por página), edición de campos de una incidencia ya
  creada, y botón **Nueva incidencia** para que el admin registre una
  directamente (sin pasar por el rider).
- El estado de una incidencia o ausencia se puede **cambiar en
  cualquier momento** (si se aprobó por error, se puede pasar a
  rechazada y viceversa).
- **Auditoría**: registro de quién aprobó, rechazó, editó o creó cada
  cosa, con fecha. También se ve directamente en la columna "Gestionado
  por" de cada tabla.
- Ausencias con **motivo obligatorio**, y ahora se pueden **aprobar o
  rechazar** (no solo "marcar como revisada"), con botón **Nueva
  ausencia** para altas directas del admin.
- El rider ve el **motivo de rechazo** y el **código de pedido** de sus
  incidencias, y una tabla con sus propias ausencias y su estado.
- **Notificaciones**: además del aviso sonoro y el toast al momento, hay
  una campana con historial de las últimas 20 notificaciones (avisa de
  incidencias y ausencias nuevas), para revisar qué entró aunque no
  estuvieras mirando la pantalla.
- Papelera con recuperación.
- Riders: alta individual y masiva, login con email + DNI.
- Reportes con gráficos (rendimiento por admin, motivos frecuentes).
- Anuncios globales visibles en ambos portales.
- Archivos en **Supabase Storage**, en buckets privados. Nadie ve un
  archivo sin pasar antes por el panel con sesión de admin (enlaces
  firmados de 5 minutos, nunca URLs públicas).
- Compresión de imágenes en el navegador del rider antes de subirlas.

### Nota de seguridad sobre el login de riders

Usar el DNI como contraseña es más rápido y no depende de email, pero es
un dato que otras personas pueden conocer o adivinar (a diferencia de
una contraseña elegida por el propio rider). Es el mismo compromiso que
tenía el sistema anterior. Supabase Auth aplica límites de intentos por
email/IP, lo que ayuda contra ataques automatizados.

### Sobre el coste de Supabase Storage a más volumen

El plan gratuito da 1 GB de archivos. Con una flota grande, eso se llena
rápido (una foto de móvil sin comprimir pesa varios MB; ya la
comprimimos en el navegador antes de subirla, pero aun así). El plan Pro
(25 $/mes) incluye 100 GB, de sobra para empezar en producción real.

### Posibles siguientes pasos (no incluidos)

- Notificaciones por email (requiere elegir un proveedor tipo Resend o
  Postmark y darme su API key).
- Exportar reportes a Excel/PDF.
