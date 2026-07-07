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

Copia `.env.local.example` a `.env.local` y rellena los 3 valores. Solo
son de Supabase — no hace falta ninguna credencial de Google.

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

### Almacenamiento de archivos (Supabase Storage)
Las fotos de incidencias, los justificantes de ausencias y las capturas
de conexiones fuera de zona se guardan en **buckets privados de Supabase
Storage** (`incidencias`, `ausencias`, `conexiones`), que crea el script
`schema_almacenamiento_final.sql`. Nunca se exponen por enlace público:
el panel genera URLs firmadas que caducan a los 5 minutos, y solo un
admin con sesión puede pedirlas.

Se intentó usar Google Drive del Workspace para ahorrar coste, pero
requiere permisos de administrador en Google Cloud (crear una cuenta de
servicio) que no siempre están disponibles, así que el sistema usa
Supabase Storage, que funciona sin depender de nadie más.

### Ahorro de espacio: compresión + borrado automático
Para que el 1 GB del plan gratuito de Supabase dure lo máximo posible:
- **Compresión fuerte en el navegador** antes de subir: las imágenes se
  reescalan a 1280px de ancho y se recomprimen (calidad 0.65). Una foto
  de móvil de 4-8 MB acaba en ~100-250 KB, y sigue siendo legible. Los
  PDF no se tocan.
- **Borrado automático de fotos con 2+ meses** (`schema_limpieza_archivos.sql`):
  cada noche se borran los archivos de incidencias/ausencias/conexiones
  con dos meses o más. **El registro se conserva** (quién, cuándo,
  motivo, estado); solo desaparece la foto, que es lo pesado, y el panel
  muestra "Archivo eliminado por antigüedad".

  Este script necesita un par de pasos de configuración (vienen
  detallados dentro del propio archivo .sql):
    1. Activar las extensiones `http` y `pg_cron` (Database → Extensions).
    2. Guardar en Vault la URL del proyecto y la `service_role` key con
       los dos `vault.create_secret(...)` que indica el script. Se hace
       así, y no poniendo la clave en el código, porque borrar de verdad
       un archivo (liberando espacio) obliga a llamar a la Storage API de
       Supabase con permisos de servicio — borrarlo por SQL directo NO
       libera el espacio, solo deja el archivo huérfano.

  ⚠️ Esas fotos son evidencias. Confirma con RRHH/legal que 2 meses es
  un plazo de conservación aceptable **antes** de ejecutar ese script.
  Para cambiar el plazo, edita el `interval '2 months'` del script. Para
  probar sin esperar a la noche: `select purgar_archivos_antiguos();`.

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
- **Solo importa** las de empresa contratante **Closer Logistics SL** con
  Estado **"Activo"** o **"Baja operativa"**. El resto se omite y se
  informa cuántas y por qué.
- **No duplica**: si el DNI ya existe, actualiza ese rider en vez de
  crear uno nuevo. Al terminar verás "X nuevos, Y actualizados".
- **Deduplica dentro del propio archivo**: si el mismo DNI aparece varias
  veces, solo cuenta la primera.
- Acepta **DNI/NIE español y también documentos de otros países** (ej.
  riders de Alemania).
- Si una celda de email trae **dos correos separados por coma**, se queda
  con el segundo.

Sobre los **centros**: el Excel usa nombres como "FD Jerez" o "MCD Oliva",
que se traducen al centro real del sistema mediante una tabla de
equivalencias (`lib/mapeoCentros.ts`). **La importación nunca crea
centros nuevos.** Si un centro del Excel no está en esa tabla (uno nuevo
o mal escrito), el rider se importa igual pero **sin centro**, y al
final se lista quiénes quedaron así para que les asignes el centro a
mano desde Configuración. Si añadís centros nuevos en el futuro, hay que
añadir su equivalencia en `lib/mapeoCentros.ts`.

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
