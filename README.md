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
   5. `supabase/schema_zonas_1.sql`
   6. `supabase/schema_zonas_2.sql`
   7. `supabase/schema_zonas_3_1.sql`
   8. `supabase/schema_zonas_3_2.sql`
   9. `supabase/schema_almacenamiento_final.sql`
   10. `supabase/schema_limpieza_archivos.sql` (lee la nota de retención antes)

   Los pasos "_1" y "_2" de cada bloque van separados a propósito (una
   limitación de Postgres: no se puede usar un valor nuevo de un `enum`
   en la misma transacción en la que se crea).
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

Copia `.env.local.example` a `.env.local` y rellena los valores.

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OVERTIME_API_USERNAME` / `OVERTIME_API_PASSWORD` — credenciales de la
  API externa de Closer Logistics (Backoffice) que usan los módulos
  "Horas extra" y "CH vs WH". Son las mismas que antes estaban guardadas
  en las Script Properties del proyecto de Apps Script. **En Vercel se
  configuran como variables de entorno del proyecto (Settings →
  Environment Variables), nunca en el código.**
- `GOOGLE_DRIVE_FOLDER_ID` — la carpeta raíz donde se guardan los
  archivos adjuntos en Google Drive. Ver más abajo por qué esta es la
  ÚNICA variable de Drive que hace falta en Vercel (el resto de la
  configuración vive en un GitHub Action, no aquí).
- `FLEET_MANAGER_USERNAME` / `FLEET_MANAGER_PASSWORD` — el DNI y
  contraseña que **todos los gestores usan por igual** para entrar a
  Fleet Manager (es una credencial compartida a nivel de empresa, no la
  cuenta personal de una persona concreta). Se configura una sola vez.

### Almacenamiento de archivos (Google Drive)
Las fotos de incidencias, los justificantes de ausencias y las capturas
de conexiones fuera de zona se guardan en el **Google Drive de la
empresa** (Workspace), no en Supabase — así se ahorra el espacio/costo
de Supabase y queda todo trazable en un Drive que el equipo ya usa.

Se organizan en carpetas por categoría y mes, dentro de una carpeta raíz
que tú creas una vez en el Drive (ej. "Closer CRM - Archivos"):
```
Closer CRM - Archivos/
├── Incidencias/2026-07/
├── Ausencias/2026-07/
└── Conexiones/2026-07/
```
Las subcarpetas de categoría y mes se crean solas la primera vez que
hace falta. **Los archivos no se borran automáticamente**: se conservan
indefinidamente.

**Privacidad:** ningún archivo se comparte con enlace público. El panel
sirve cada archivo a través de una ruta propia (`/api/drive-file`) que
exige sesión de admin válida antes de descargarlo de Drive y entregarlo.

#### Por qué esto NO usa un Client ID de Google Cloud

Crear un Client ID/Secret propio en Google Cloud Console requiere
permisos de administrador de Workspace que no están disponibles en esta
empresa. La alternativa que sí funciona sin esos permisos:

1. En tu ordenador, **`rclone` ya mantiene una sesión válida con Google
   Drive** (usando su propio client_id interno — es su uso normal y
   legítimo, no requiere nada especial de tu parte).
2. Un **GitHub Action programado** (`.github/workflows/refrescar-drive-token.yml`,
   corre cada 45 min) deja que rclone renueve el token si hace falta, y
   guarda ese `access_token` vigente en una tabla de Supabase
   (`google_drive_token`).
3. La app (en Vercel) **solo lee** ese token de Supabase y lo usa
   directo contra la API de Drive — nunca intenta renovarlo por su
   cuenta, así que nunca necesita Client ID ni Secret.

El token dura ~60 minutos; al renovarse cada 45, siempre debería haber
uno vigente. Si el Action deja de correr por más de ~55 min, las subidas
fallan con un mensaje claro indicando justamente eso (revisar que el
Action esté corriendo).

#### Cómo configurarlo

1. Ejecutar `supabase/schema_drive_token.sql` en el SQL Editor.

2. En Google Drive, crea la carpeta raíz (ej. "Closer CRM - Archivos"),
   ábrela en el navegador y copia el ID de la carpeta desde la URL
   (`https://drive.google.com/drive/folders/`**`ESTE_ID`**).

3. En Vercel (Settings → Environment Variables) añade solo:
   - `GOOGLE_DRIVE_FOLDER_ID` (el ID del paso anterior)

4. En el repositorio de GitHub de este proyecto, ve a Settings → Secrets
   and variables → Actions, y añade estos secrets:
   - `RCLONE_CONF` — el contenido completo de tu `~/.config/rclone/rclone.conf`
     (el mismo que ya usas para el pipeline de métricas — puedes copiar
     literalmente el mismo secret que ya tienes en el otro repositorio,
     o crear uno nuevo aquí con el mismo contenido)
   - `RCLONE_REMOTE_NAME` — el nombre del remoto dentro de ese archivo
     (ej. `closer_drive_dashboard`, es lo que aparece entre corchetes
     `[...]` en el rclone.conf)
   - `GOOGLE_DRIVE_FOLDER_ID` — el mismo ID del paso 2
   - `SUPABASE_URL` — la URL de tu proyecto de Supabase
   - `SUPABASE_SERVICE_ROLE_KEY` — la service role key de Supabase

5. Corre el Action manualmente una vez (Actions → "Refrescar token de
   Google Drive" → Run workflow) para confirmar que guarda el token
   correctamente, antes de esperar a que corra solo por el cron.

## 4. Desarrollo local

```bash
npm install
npm run dev
```

## 5. Desplegar en Vercel

1. Sube el proyecto a un repo de GitHub/GitLab.
2. En Vercel, importa el repo.
3. En **Settings → Environment Variables**, añade las 3 variables de Supabase.
4. Despliega.

## 6. Mapa de URLs para hacer pruebas

Sustituye `localhost:3000` por tu dominio de Vercel cuando despliegues.

| URL | Quién entra | Qué hace |
|---|---|---|
| `/` , `/login` , `/panel` | Rider (por defecto) | Todos redirigen al login del rider |
| `/rider/login` | Rider | Iniciar sesión (DNI + contraseña) |
| `/rider/dashboard` | Rider | Reportar incidencia / comunicar ausencia |
| `/gestor/login` | Admin | Iniciar sesión (email + contraseña) — URL no enlazada desde ningún sitio |
| `/dashboard` | Admin | Resumen con estadísticas en vivo |
| `/dashboard/incidencias` | Admin | Listado, filtros, aprobar/rechazar/editar |
| `/dashboard/ausencias` | Admin | Ausencias comunicadas por riders |
| `/dashboard/riders` | Admin | Alta individual de riders, importar Excel |
| `/dashboard/conexiones` | Admin | Registro de conexiones fuera de zona |
| `/dashboard/reportes` | Admin | Gráficos de rendimiento y motivos |
| `/dashboard/auditoria` | Admin | Quién aprobó, rechazó, editó o creó cada cosa |
| `/dashboard/papelera` | Admin | Incidencias eliminadas, recuperables |
| `/dashboard/configuracion` | Super Admin y Administrador | Ver sección 7 (el alcance depende del rol) |

`/gestor/login` es comodidad, no seguridad real (cualquiera puede ver esa
ruta en el código fuente público de la web). Lo que protege el panel es
la contraseña + que la cuenta exista en la tabla `admins`. Puedes
renombrar la carpeta `app/gestor/login` a lo que prefieras si quieres
una ruta menos adivinable.

No hay URL para "crear el primer admin": eso se hace una vez, a mano,
en el SQL Editor (paso 2.4).

## 7. Zonas, ciudades e importación de riders

### Ciudades y centros
Los centros ("MADRID CENTRO", "MADRID ALCOBENDAS"...) están agrupados en
ciudades ("MADRID"). Esto permite filtrar por "Madrid" y ver todos sus
centros de golpe, o por un centro concreto. Si necesitas más ciudades o
mover un centro de ciudad, hazlo desde **Configuración → Centros** (ahí
se ve a qué ciudad pertenece cada uno) o directamente por SQL si son
muchos cambios de golpe.

### Roles de administrador
- **Super Admin** (TI): ve y gestiona **todo**, sin restricción de zona.
  Configuración completa (catálogos, anuncio, y alta de cualquier rol).
- **Administrador** (gestor de zona): ve y gestiona **solo los datos de
  las ciudades que se le asignen**. En Configuración solo ve el
  **Anuncio Global** y el alta de usuarios, y ahí solo puede crear
  **Moderadores dentro de sus propias ciudades**. En la lista de
  usuarios solo ve a los moderadores de su zona (y a sí mismo).
- **Moderador**: igual de restringido a sus ciudades, pero **no entra a
  Configuración** en absoluto. Está para estar pendiente de la
  herramienta (incidencias, ausencias, etc.) de su zona.

Tanto Administrador como Moderador quedan restringidos por RLS en la
base de datos: aunque manipulen el navegador, no pueden leer datos de
una ciudad que no tienen asignada.

Se asigna desde **Configuración → Administradores**. Si quien crea la
cuenta es Super Admin, puede elegir cualquiera de los tres roles y
cualquier ciudad; si es Administrador, solo puede crear Moderadores y
solo asignarles ciudades de su propia zona.

**Importante:** la Auditoría (quién aprobó/rechazó/editó qué) es visible
para todos los admins sin importar su zona, ya que es un registro de
actividad general del sistema, no datos de un rider en concreto. Si
prefieres que también se filtre por zona, dímelo y lo ajusto.

### Ciudades y centros
Los centros ("MADRID CENTRO", "MADRID ALCOBENDAS"...) están agrupados en
ciudades ("MADRID"). Esto permite filtrar por "Madrid" y ver todos sus
centros de golpe, o por un centro concreto. Si necesitas más ciudades o
mover un centro de ciudad, hazlo desde **Configuración → Centros** (ahí
se ve a qué ciudad pertenece cada uno) o directamente por SQL si son
muchos cambios de golpe.

### Gestores
Además de la ciudad, cada centro pertenece (indirectamente, a través de
la ciudad) a un gestor. Esto es solo para **filtrar** en las tablas — no
es un rol con acceso al panel. Si el mapeo gestor↔ciudad cambia, se
edita directamente en las tablas `gestores` y `gestor_ciudades` por SQL.

### Importar riders desde Excel
En `/dashboard/riders`, botón "Importar Excel". Acepta el archivo tal
cual lo exporta vuestro sistema de RRHH. Está pensado para subir el
**Excel completo todos los días** sin duplicar nada.

Qué hace con cada fila:
- **Solo importa** las de empresa contratante **Closer Logistics SL** o
  **Closer Go Germany GmbH**, con puesto **Rider** y Estado
  **"Activo"** o **"Baja operativa"**. El resto se omite y se informa
  cuántas y por qué.
- **No duplica**: si el DNI ya existe, actualiza ese rider en vez de
  crear uno nuevo. Al terminar verás "X nuevos, Y actualizados".
- **Deduplica dentro del propio archivo**: si el mismo DNI aparece varias
  veces, solo cuenta la primera.
- Acepta **DNI/NIE español y también documentos de otros países** (ej.
  riders de Alemania).
- Si una celda de email trae **dos correos separados por coma**, se queda
  con el segundo.

Sobre los **centros**: el Excel usa nombres como "FD Jerez", que se
traducen al centro real del sistema mediante una tabla de equivalencias
(`lib/mapeoCentros.ts`). La importación **no crea centros nuevos**,
salvo una excepción: los centros **"MCD..."** (una operación aparte, con
sus propios riders) **sí se crean automáticamente** la primera vez que
aparecen, con una ciudad del mismo nombre. Para cualquier otro centro no
reconocido (uno nuevo o mal escrito, que no sea MCD), el rider se
importa igual pero **sin centro**, y al final se lista quiénes quedaron
así para que les asignes el centro a mano desde Configuración. Si añadís
centros nuevos (no-MCD) en el futuro, hay que añadir su equivalencia en
`lib/mapeoCentros.ts`.

**Rendimiento:** la importación procesa el archivo por lotes y resuelve
en bloque (una consulta para saber quién ya existe, un único UPSERT para
actualizar a todos los existentes); solo los riders realmente nuevos
requieren crear su acceso uno a uno. Por eso el tiempo depende sobre
todo de cuántos riders nuevos haya, no del total del archivo: una subida
diaria donde casi todos ya existen es rápida.

**Ya no hay alta masiva por texto**. Sigue existiendo el alta individual
para un rider suelto entre subida y subida del Excel.

### Conexiones fuera de zona
Sección para registrar cuando un rider se conecta fuera de su zona
habitual: buscas al rider por nombre o DNI (se autocompleta su centro),
indicas la fecha, adjuntas una captura de pantalla y, si quieres, una
observación.

**Rendimiento — esto es importante, la API externa no tiene forma de
pedir varios drivers a la vez, así que la estrategia es no pedir dos
veces lo mismo y no pedir en serie lo que se puede pedir en paralelo:**
- **"Calcula horario"** (dato del contrato del rider, casi nunca cambia)
  se guarda de forma **persistente** en `overtime_drivers_calcula`. Solo
  se pide a la API la primera vez que se ve un rider; las siguientes
  consultas lo leen de la base de datos. Si alguna vez cambia, hay un
  botón de refresco por fila y otro para refrescar todos los visibles en
  la tabla de CH vs WH.
- El resultado de **CH vs WH** por centro/semana se cachea **30
  minutos** (`ch_vs_wh_cache`), pensado para que las ~3 consultas diarias
  típicas casi nunca toquen la API.
- **Horas extra** usa el propio historial guardado
  (`overtime_registros`): si un centro ya tiene datos de los últimos 5
  minutos, no se vuelve a pedir a la API para esa consulta.
- En ambos paneles hay un checkbox **"Forzar actualización en vivo"**
  para saltarse la caché cuando haga falta el dato exacto del momento.
- Los centros que sí hay que consultar se piden **en paralelo** (varios
  centros a la vez, y dentro de cada centro los 7 días de la semana
  también en paralelo), en vez de uno detrás de otro como hacía el
  código original.
- Ambas tablas se pueden **ordenar haciendo clic en cualquier
  encabezado** (Centro, Rider, Fecha, Uber, On Demand, CH, WH, Balance,
  etc.); un segundo clic invierte el orden.

## 7.2. Auditoría por zona, retención y anuncios múltiples

**Auditoría** (`/dashboard/auditoria`) ahora respeta zona igual que el
resto del sistema: antes cualquier admin veía el historial completo de
todo el país; ahora un admin/moderador solo ve la auditoría de sus
ciudades, y el super_admin sigue viendo todo. Requiere ejecutar
`schema_auditoria_anuncios.sql`.

**Retención de auditoría: 6 meses, borrado automático.** Se programó con
`pg_cron` para correr cada noche (03:00). Al ser solo texto, 6 meses no
representa un problema de espacio; simplemente se decidió no acumular
indefinidamente. Para comprobar cuántas filas se borrarían sin borrar
nada: `select count(*) from auditoria where created_at < now() - interval '6 months';`.
Para forzarlo ya: `select purgar_auditoria_antigua();`.

**Anuncios**: ahora pueden coexistir varios anuncios activos a la vez
(antes solo uno), y cada uno tiene dos dimensiones independientes:
- **Alcance**: global (todas las ciudades) o una ciudad concreta. Un
  administrador de zona solo puede publicar en sus propias ciudades,
  nunca global; el super_admin puede ambas.
- **Audiencia**: "para todos", "solo administradores" o "solo riders" —
  útil para avisos de gestión interna (ej. "revisar horas extra") que no
  tiene sentido que vea un rider.

## 7.1. Horas extra (Overtime) y CH vs WH

Reemplaza el antiguo "Panel Overtime" y el proyecto "CH vs WH" que vivían
como apps aparte en Google Apps Script. Ahora son dos páginas del CRM
(`/dashboard/overtime` y `/dashboard/ch-vs-wh`) que reutilizan el mismo
sistema de roles/zonas: un administrador o moderador solo ve y audita
los centros de sus ciudades asignadas; el super_admin ve todos. Ya no
hay selector de gestor (sobra: la sesión ya determina qué ve cada uno).

**Cómo funciona:**
- `centros.api_centro_id` enlaza cada centro del CRM con su ID en la API
  externa de Closer Logistics (son sistemas de identificación distintos).
  Si en el futuro se abre un centro nuevo, hay que añadir su
  equivalencia en `schema_overtime.sql` o vía SQL directo.
- **Horas extra**: al pulsar "Obtener datos", se consulta la API externa
  y el resultado se guarda en la tabla `overtime_registros` (sustituye a
  la caché temporal y la hoja de auditoría que usaba Apps Script). La
  auditoría (confirmar/rechazar) queda protegida por RLS de zona.
- **CH vs WH**: es solo informativo (horas contratadas vs. trabajadas,
  balance, horas extra, si el driver "calcula horario", incidencias del
  horario). No se guarda en base de datos ni tiene auditoría; cada
  consulta trae los números de ese momento.
- Ninguno de los dos exporta a Excel/CSV/pestaña — todo queda en la base
  de datos del CRM.

**Antes de usarlo por primera vez:** ejecutar `schema_overtime.sql` en el
SQL Editor de Supabase, y configurar `OVERTIME_API_USERNAME` /
`OVERTIME_API_PASSWORD` en las variables de entorno de Vercel.

## 7.3. Métricas operativas (conexión, aceptación, cancelación)

Se piden **en vivo** a la API de Fleet Manager
(`fleet-manager.ondemand.closerlogistics.com`) — ya no hay tabla propia,
ni parquet, ni Apps Script, ni Edge Function, ni carga manual. Es la
versión más simple y confiable de las tres que tuvo este módulo:

- **Emparejamiento por DNI**: la API devuelve el `document_number` (el
  DNI) de cada rider directamente, así que ya no hace falta el
  emparejamiento por email (que fallaba cuando un rider usaba un email
  distinto en la app de reparto que en RRHH — llegó a pasar).
- **Diario y semanal, en ambos lados**: tanto el rider como el admin
  pueden alternar entre ver un día concreto o una semana completa.
- **El rider** ve, en la pestaña "Mis métricas" de `/rider/dashboard`,
  una tabla día a día de la semana (solo los días que ya pasaron, igual
  que el panel anterior) más el resumen agregado de toda la semana.
- **El admin** ve `/dashboard/metricas`: tabla agregada por rider,
  filtrada a los centros de su zona (super_admin ve todos), con
  selector Diario/Semanal, buscador por nombre/DNI, y una caché de 30
  min por centro/día o centro/semana (la respuesta de la API puede
  pesar más de 1 MB por centro, así que no se repite la petición en
  cada clic).
- **Protección contra clics rápidos**: si cambias de semana/día varias
  veces seguidas antes de que responda la API, solo se aplica el
  resultado de la consulta más reciente — las respuestas "viejas" que
  llegan tarde se descartan, para que nunca se vea el dato de un periodo
  con la etiqueta de otro.

### Cómo activarlo

1. Ejecutar `supabase/schema_metricas_api.sql` — elimina las tablas del
   sistema anterior (`driver_daily_stats`, `sync_audit_log`,
   `email_metricas`) y añade las cachés nuevas (`fleet_metrics_cache`
   para semanal, `fleet_metrics_cache_diario` para diario) y el mapeo de
   centros de Alemania.
2. Variables de entorno en Vercel: `FLEET_MANAGER_USERNAME` /
   `FLEET_MANAGER_PASSWORD` (ver más abajo qué credencial va aquí).

**Nota sobre la autenticación**: la API usa login con DNI+contraseña que
devuelve una cookie de sesión (confirmado por la cabecera `vary: Cookie`
de sus respuestas). El `csrf_token` que devuelve el login no parece
necesario para peticiones de solo lectura (GET) como las que usamos
aquí — si en producción diera error 401/403, es la primera pista a
revisar.

## 7.4. Instrucciones al aprobar una incidencia

Cada **motivo** de incidencia puede tener un texto de "instrucciones al
aprobar" (Configuración → Motivos → icono de lápiz). Si está definido,
cuando se aprueba una incidencia de ese motivo, al rider le aparece un
popup ("✓ Incidencia aprobada" + el texto) además del aviso normal en la
campanita. Si no se define nada para ese motivo, solo sale el aviso
normal, sin popup. Requiere `schema_instrucciones_aprobacion.sql`.

## 7.5. Exportar a Excel

- **Conexiones fuera de zona** (`/dashboard/conexiones`): botón
  "Exportar a Excel" — exporta las filas que cumplen los filtros activos
  en pantalla (ciudad, centro, fechas, búsqueda), hasta 5000 filas.
- **Métricas** (`/dashboard/metricas`): botón "Exportar esta tabla" —
  exporta exactamente lo que se ve en pantalla en ese momento (diario o
  semanal, con el centro y la búsqueda que tengas activos), sin volver a
  consultar la API ni pedir un rango aparte.

## 8. Qué incluye esta versión

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
- **Notificaciones**: campana con historial de las últimas notificaciones
  (avisa de incidencias y ausencias nuevas), con sonido activable/desactivable.
  El rider también tiene su propia campana: le avisa en cuanto le
  aprueban o rechazan algo.
- Papelera con recuperación.
- Riders: alta individual, importación desde Excel (con filtro de
  Estado), login con **DNI + contraseña** (ver nota más abajo), campos
  de RRHH (provincia, puesto, fechas de alta/baja, teléfono, etc.).
- **Zonas**: tanto Administrador como Moderador están restringidos a las
  ciudades que se les asignen; solo el Super Admin ve todo. Centros
  agrupados por ciudad para filtrar por cualquiera de los dos niveles.
- **Gestores**: filtro adicional que agrupa ciudades bajo un gestor.
- **Conexiones fuera de zona**: registro con captura de pantalla de
  cuándo un rider se conecta fuera de su zona habitual.
- **Filtros con fecha** en incidencias, ausencias, riders, papelera,
  auditoría y conexiones fuera de zona.
- Reportes con gráficos (rendimiento por admin, motivos frecuentes).
- Anuncios globales visibles en ambos portales (editable por Super Admin
  y Administrador).
- Archivos en **Supabase Storage** (buckets privados). Nadie ve un
  archivo sin sesión de admin: se sirven con URLs firmadas temporales de
  5 minutos, nunca por enlace público. Imágenes comprimidas en el
  navegador y borrado automático de las que superan los 2 meses (ver
  sección 3).
- Compresión de imágenes en el navegador del rider antes de subirlas.
- Logo y favicon de Closer Logistics ya integrados en login, panel y
  portal del rider.

### Bug corregido: riders/incidencias invisibles sin centro asignado
Si una incidencia, ausencia o rider se guardaba sin `centro_id` (por
ejemplo, al crear un rider sin elegir centro), se volvía invisible para
**todos** los administradores, incluido el Super Admin, por cómo estaba
escrita la regla de zona. Ya está corregido: ahora el Super Admin
siempre ve esas filas. Además, el campo Centro ya es obligatorio al dar
de alta un rider desde el formulario, para que no vuelva a pasar.

### Nota de seguridad sobre el login de riders

La contraseña ahora se genera a partir del nombre (inicial del nombre en
mayúscula + inicial del apellido en minúscula + "123456", ej. "Luis
Gonzales" → `Lg123456`). Es muy rápido de comunicar y no depende de
email, pero quiero ser directo: es **más adivinable que el DNI**, porque
el nombre de una persona suele ser más público que su documento de
identidad. Cualquiera que sepa el nombre completo de un rider puede
calcular su contraseña. Lo implementé tal cual lo pediste, pero es un
compromiso real de seguridad, no solo una molestia teórica — sabiéndolo,
decides tú si te vale así o prefieres algo con un componente menos
adivinable (por ejemplo, añadiendo los dos últimos dígitos del DNI en
vez de "123456" fijo). Dímelo si quieres que lo ajuste.

**Riders creados antes de este cambio** siguen teniendo su DNI como
contraseña antigua. Desde `/dashboard/riders`, cada fila tiene un botón
(icono de llave) para recalcular su contraseña al esquema nuevo — te
muestra la contraseña nueva en pantalla para que se la puedas pasar al
rider.

### Sobre el almacenamiento y el límite de 1 GB

Los archivos se guardan en Supabase Storage. El plan gratuito da 1 GB.
Para que dure lo máximo posible sin pagar:

- Las imágenes se comprimen fuerte en el navegador antes de subir
  (~100-250 KB por foto), así que 1 GB da para muchísimas.
- El borrado automático elimina las fotos de más de 2 meses cada noche,
  conservando el registro. Esto mantiene el uso de Storage casi plano en
  el tiempo: entra lo del último par de meses y sale lo más viejo.

Si aun así algún día se llenara, las opciones son subir el plazo de
borrado (menos retención) o pasar al plan Pro de Supabase (25 $/mes,
100 GB). Con Madrid y estos ajustes, el margen para arrancar es amplio.

### Posibles siguientes pasos (no incluidos)

- Notificaciones por email (requiere elegir un proveedor tipo Resend o
  Postmark y darme su API key).
- Exportar reportes a Excel/PDF.
