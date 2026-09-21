# Migración a PHP / Symfony — Closer CRM

Documento de traspaso. Describe **qué hace** cada feature reciente, **por qué está hecha así**
(incluidas las trampas que ya nos costaron caro) y **qué hay que replicar** en el proyecto
Symfony. No es una traducción línea a línea: es el contrato funcional + el modelo de datos +
las reglas de negocio, que es lo que tiene que sobrevivir al cambio de stack.

> **Cómo usar este documento.** Cada feature es independiente y se puede migrar por separado.
> El orden de las secciones es el orden recomendado de migración (de menos a más acoplado).
> Las secciones marcadas ⚠️ contienen decisiones que **no son opcionales**: si se implementan
> de otra forma, se reintroduce un bug que ya ocurrió en producción.

---

## 0. Contexto: de dónde vienes y a dónde vas

| | Origen (actual) | Destino (Symfony) |
|---|---|---|
| Framework | Next.js 14 App Router | Symfony (PHP) |
| Acceso a datos | Supabase JS (PostgREST) + RPC | Doctrine ORM / DBAL |
| Base de datos | **PostgreSQL (la misma)** | **PostgreSQL (la misma)** |
| Autorización | **RLS en Postgres** | ⚠️ ver §1 |
| Lógica de servidor | Server Actions (`'use server'`) | Controllers + Services |
| Revalidación de caché | `revalidatePath()` | Invalidación de caché HTTP / redirect |
| i18n | Diccionarios TS con paridad de claves en compilación | Translation component (`translations/*.yaml`) |
| Ficheros | Google Drive API | Google Drive API (igual) |

**La base de datos no cambia.** Todas las tablas, vistas, funciones, enums y políticas
descritas aquí **ya existen en producción**. La migración es de la capa de aplicación.
Esto es una ventaja enorme: el modelo de datos es el contrato, y ya está validado.

### ⚠️ 0.1 El riesgo número uno de esta migración: el RLS

Hoy la autorización **no está en el código de la aplicación**, está en la base de datos,
en políticas RLS de PostgreSQL. El código hace `select * from incidencias` sin filtrar por
centro, y Postgres devuelve solo las filas del ámbito del gestor que consulta.

Symfony con Doctrine se conecta con **un único usuario de base de datos** y normalmente
**no propaga la identidad del usuario final a Postgres**. Si te conectas con el usuario
dueño de las tablas (o uno con `BYPASSRLS`), **todas las políticas dejan de aplicar y cada
moderador verá los datos de todos los centros**. Es una fuga de datos silenciosa: no da
error, simplemente devuelve de más.

Hay dos caminos. Decide **antes** de migrar la primera pantalla:

**Opción A — Replicar el scoping en la aplicación (recomendado para Symfony).**
Un servicio `AmbitoUsuario` que devuelva los `centro_id` visibles para el usuario actual, y
**todos** los repositorios que toquen `incidencias`, `ausencias`, `riders`, `centros`,
`auditoria`, `stock_*` aplican `->andWhere('x.centroId IN (:ambito)')`. Conviene apoyarlo en
un **Doctrine SQL Filter** para que sea imposible olvidarlo en una consulta nueva.
Auditar consulta por consulta contra las políticas actuales:

```bash
# Lista las políticas vigentes que hay que replicar
psql "$DATABASE_URL" -c "select tablename, policyname, cmd, qual from pg_policies order by 1,3;"
```

**Opción B — Mantener el RLS.** Requiere que cada petición abra la conexión con
`SET LOCAL role authenticated` + `SET LOCAL request.jwt.claims = '...'`, dentro de la misma
transacción de la petición. Es fiel al modelo actual y no duplica reglas, pero obliga a
controlar el pool de conexiones con mucho cuidado (una conexión reutilizada con el `role`
de otro usuario es un desastre). Solo si el equipo está cómodo con esto.

**Reglas de ámbito actuales, en lenguaje llano** (a replicar en la opción A):
- `super_admin`: ve todo.
- `administrador` / `moderador`: ve solo los centros de las ciudades que tiene asignadas
  (`gestor_ciudades` → `ciudades` → `centros`).
- `rider`: ve solo sus propias filas (`rider_id = <su id>`).

### 0.2 Convenciones que conviene conservar

- **El código y los comentarios están en español.** Los nombres de tablas/columnas también.
  Mantenlo: mezclar idiomas en el dominio es la vía rápida a que nadie entienda nada.
- **Los comentarios explican el *porqué*, no el *qué*.** Varios comentarios del código actual
  documentan bugs reales de producción. Al migrar, **cópialos**: valen más que el código.
- **Nunca se borra de verdad.** Incidencias y ausencias van a `estado = 'papelera'`.
  Solo el borrado de riders (§8) es físico y solo para `super_admin`.
- **Toda acción de gestión escribe en `auditoria`** (`admin_id`, `accion`, `detalles`, `centro_id`).

---

## 1. Papelera unificada (incidencias + ausencias) ⚠️

La feature más reciente y la que más trampas escondía.

### 1.1 Qué hace

Una sola pantalla `/dashboard/papelera` que lista **incidencias y ausencias** enviadas a la
papelera, mezcladas y ordenadas por fecha de eliminación descendente, con:

- columna **Tipo** (badge: gris = incidencia, ámbar = ausencia),
- **filtro desplegable por tipo** (`?tipo=incidencia|ausencia`),
- filtros compartidos: búsqueda (nombre/DNI), ciudad, centro, rango de fechas,
- **paginación de 20 por página**,
- botón **Recuperar** por fila, que devuelve el registro a `estado = 'pendiente'`.

### 1.2 Modelo de datos

Ambas tablas tienen las mismas tres piezas para la papelera:

```sql
-- incidencias: ya las tenía
-- ausencias: añadidas en esta iteración
alter table ausencias add column eliminado_por_id uuid references admins(id);
alter table ausencias add column fecha_eliminacion timestamptz;
```

⚠️ **`estado` es un ENUM de PostgreSQL, no texto.** Esto nos costó un fallo en producción:

```sql
-- Los tipos reales
estado_incidencia: ('pendiente', 'aprobada', 'rechazada', 'papelera')
estado_ausencia:   ('pendiente', 'aprobada', 'rechazada', 'revisada', 'papelera')
--                                                          ^en desuso   ^añadido ahora
```

**Qué pasó:** implementamos toda la papelera de ausencias asumiendo que `estado` era texto.
El valor `'papelera'` no existía en el enum `estado_ausencia`. Resultado: la consulta
`WHERE estado <> 'papelera'` de la lista de Ausencias **no dio error — devolvió 0 filas de
3.441**. Un filtro contra un valor de enum inexistente hace fallar la consulta entera y la
capa de datos lo tragó como "lista vacía". Se arregló con:

```sql
ALTER TYPE estado_ausencia ADD VALUE IF NOT EXISTS 'papelera';
```

**Para Symfony:** si mapeas estos campos con `#[ORM\Column(enumType: EstadoAusencia::class)]`,
el enum PHP **debe** incluir `Papelera = 'papelera'` o Doctrine lanzará al hidratar. Y la
lección general: **valida siempre contra `enum_range()` antes de dar por hecho que una columna
de estado acepta un valor nuevo.**

### 1.3 ⚠️ La vista `papelera_items` — y por qué no se mezcla en memoria

La primera implementación pedía las dos tablas por separado y las mezclaba en PHP/JS.
**Estaba ocultando 3.848 registros.** PostgREST corta en 1.000 filas por respuesta: había
4.847 incidencias en papelera y solo se veían las 1.000 más recientes. Todo lo anterior era
invisible **e irrecuperable desde el panel**.

Además, mezclar en memoria hace imposible paginar bien: para la página N necesitas
`offset + limit` filas de *cada* tabla, y el coste crece con la profundidad de la página.

La solución es una vista que hace el `UNION` en la base de datos, de modo que ordenar,
contar y paginar ocurre una sola vez y sobre el conjunto completo:

```sql
create or replace view papelera_items
with (security_invoker = true) as
select
  i.id::text       as id,
  'incidencia'::text as tipo,
  i.nombre_rider, i.dni, i.centro_id,
  c.nombre         as centro_nombre,
  m.nombre         as motivo_nombre,
  m.nombre_en      as motivo_nombre_en,
  a.usuario        as eliminado_por,
  i.fecha_eliminacion
from incidencias i
left join centros c on c.id = i.centro_id
left join motivos m on m.id = i.motivo_id
left join admins  a on a.id = i.eliminado_por_id
where i.estado = 'papelera'
union all
select
  au.id::text, 'ausencia'::text,
  au.nombre_rider, au.dni, au.centro_id,
  c.nombre, ma.nombre, ma.nombre_en, a.usuario, au.fecha_eliminacion
from ausencias au
left join centros c on c.id = au.centro_id
left join motivos_ausencia ma on ma.id = au.motivo_id
left join admins a on a.id = au.eliminado_por_id
where au.estado = 'papelera';

grant select on papelera_items to authenticated;
```

⚠️ **`security_invoker = true` no es decorativo.** Sin esa opción, una vista se ejecuta con
los permisos de su propietario y **se salta el RLS de las tablas base**: un moderador vería
la papelera de centros que no son suyos. Requiere PostgreSQL ≥ 15 (producción va en 17.6).

Verificación que debes repetir tras cualquier cambio en la vista:

```sql
set local role authenticated;
select count(*) from papelera_items;   -- debe devolver 0 sin sesión
```

**Si migras a la opción A (scoping en aplicación)**, la vista sigue siendo útil por el UNION
y la paginación, pero deja de protegerte: el repositorio tendrá que añadir el
`AND centro_id IN (:ambito)` a mano.

**En Symfony**, la vista se mapea limpiamente como una entidad de solo lectura:

```php
#[ORM\Entity(readOnly: true)]
#[ORM\Table(name: 'papelera_items')]
class PapeleraItem { /* id, tipo, nombreRider, dni, centroId, ... */ }
```

### 1.4 Acciones

Cuatro operaciones, dos por tipo, todas con el mismo patrón:

```
enviarAPapelera(id):        estado='papelera', eliminado_por_id=<admin>, fecha_eliminacion=now()
recuperarDePapelera(id):    estado='pendiente', eliminado_por_id=null,   fecha_eliminacion=null
```

Cada una escribe en `auditoria` con el `centro_id` de la fila afectada y refresca las dos
vistas implicadas (la lista de origen y la papelera).

Nota de comportamiento: **recuperar siempre devuelve a `pendiente`**, aunque el registro
estuviera aprobado o rechazado antes de ir a la papelera. Es deliberado (obliga a revisarlo
otra vez), pero si en Symfony se quiere conservar el estado previo habría que añadir una
columna `estado_anterior`. Decisión de producto pendiente, no un bug.

### 1.5 UI

- Botón de papelera (icono papelera) junto a Aprobar/Rechazar en cada fila de Ausencias,
  con `confirm()` antes de ejecutar. Idéntico al que ya existía en Incidencias.
- Las listas de Incidencias y Ausencias excluyen lo que está en papelera
  (`WHERE estado <> 'papelera'`).
- La cabecera de Papelera muestra el total de resultados.

---

## 2. Prevención de registros duplicados ⚠️

### 2.1 El problema

Riders generando **tandas de hasta 17-20 incidencias/ausencias idénticas**, separadas por
intervalos regulares de ~3 segundos, con el mismo minuto de creación. Afectó a 347 riders
desde julio de 2026. Volumen acumulado: **843 ausencias y 542 incidencias sobrantes**
(grupos idénticos creados dentro del mismo minuto).

**No son clics humanos.** El botón de envío ya se deshabilita mientras la petición está en
vuelo, y el patrón es metronómico. Es un reintento automático: red móvil inestable, el
navegador, un proxy, o el propio cliente reintentando un POST que tardó demasiado. No se
pudo identificar la causa exacta desde los datos.

**Por eso la defensa está en el servidor.** Cualquier mitigación en el cliente (deshabilitar
el botón, un token de formulario) falla precisamente en el escenario que causa el problema.
La única defensa fiable es que **el endpoint sea idempotente**.

### 2.2 La solución

Antes de insertar, se busca un registro **idéntico del mismo rider creado en los últimos
2 minutos**. Si existe, **no se inserta nada y se devuelve éxito igual** (el rider ve que su
envío se registró, que es lo que quería — no es un error para él).

```
VENTANA_ANTIDUPLICADOS = 2 minutos

Incidencia — clave de identidad:  rider_id + motivo_id + codigo_pedido
Ausencia   — clave de identidad:  rider_id + motivo_id + fecha_inicio + fecha_fin
```

Dos detalles que parecen menores y no lo son:

⚠️ **La guarda va ANTES de subir los ficheros a Google Drive.** En la primera versión estaba
después. No creaba filas duplicadas, pero **cada reintento subía otra copia de los
justificantes y capturas a Drive**, dejando ficheros huérfanos que nadie referencia. En
Symfony: comprueba el duplicado antes de tocar el `FileUploader`.

⚠️ **`codigo_pedido` puede ser NULL** (hay motivos que no lo piden). En SQL,
`codigo_pedido = NULL` **nunca es cierto**, así que esos casos se colaban por el hueco.
Hay que ramificar explícitamente:

```sql
-- si hay código:
... and codigo_pedido = :codigo
-- si no hay código:
... and codigo_pedido is null
```

En Doctrine, `->andWhere($codigo === null ? 'i.codigoPedido IS NULL' : 'i.codigoPedido = :c')`.

### 2.3 Aviso de posible duplicado (capa separada, ya existente)

Independiente de lo anterior: si el rider envió **cualquier** incidencia en los últimos
**5 minutos**, el formulario le pregunta *"¿Ya reportaste esto?"* con el motivo y los minutos
transcurridos, y puede confirmar (`forzarDuplicado=true`) o cancelar.

Es una capa de UX, no de integridad: un reintento automático que reenvía el formulario
**con `forzarDuplicado=true` ya marcado** (porque el rider confirmó una vez) se salta este
aviso por completo. Ése es exactamente el hueco que tapa la guarda de §2.2. **Hacen falta
las dos.**

### 2.4 Estado de los datos históricos

**Los duplicados ya existentes se han dejado como están** por decisión del cliente. La guarda
evita los nuevos. Si en algún momento se quiere limpiar, la consulta que los identifica es:

```sql
select rider_id, motivo_id, fecha_inicio, fecha_fin,
       date_trunc('minute', created_at) as minuto, count(*)
from ausencias
where estado <> 'papelera'
group by 1,2,3,4,5
having count(*) > 1;
```

(Conservando el más antiguo de cada grupo. **No ejecutar sin aprobación explícita.**)

---

## 3. Performance — métricas operativas de riders

Antes se llamaba "Métricas Operativas"; **el nombre de cara al usuario es "Performance"**
(navegación y título de página). Conviene respetarlo en las traducciones del nuevo proyecto.

### 3.1 Origen de los datos

Los datos **no los genera esta aplicación**. Un pipeline externo en Python (repositorio
aparte, ejecutado por GitHub Actions) descarga los informes de Uber y escribe en:

```sql
driver_daily_stats (
  id bigint primary key,
  created_at timestamptz not null default now(),
  day date not null,
  courier_uuid text not null,     -- identificador del rider en Uber
  driver_name text, driver_number text, email text,
  city text, flow_type text,
  num_of_trips, online_hours, active_hours,
  accept_trips, reject_trips, cancel_trips, cancel_not_at_fault,
  tph, pct_accept, pct_cancel     -- todos double precision
)
```

⚠️ **`driver_daily_stats` tiene RLS activado y CERO políticas.** Nadie puede leerla con el
cliente normal — es deliberado. Todo acceso va con el **rol de servicio** (service role).
En Symfony esto se traduce en: esta tabla se consulta con la conexión de aplicación y el
control de acceso lo hace el código (ya has comprobado que el usuario es admin), **no la
base de datos**. Documéntalo en el repositorio para que nadie "arregle" la falta de políticas.

⚠️ **El dato del día en curso llega incompleto y tarde.** El export de Uber no contiene las
filas del día actual a primera hora: históricamente la primera aparición nunca es antes de
las **11:30 hora de Madrid**. Un día D entra parcial y se completa el D+1. Esto no es un bug
del pipeline ni de la aplicación — es cómo publica Uber. Conviene decirlo en la interfaz
antes de que alguien abra una incidencia por ello.

### 3.2 ⚠️ La función `get_centers_data` — la optimización que no se puede perder

Existía `get_center_data(p_centro_id, p_date_from, p_date_to)`, para **un** centro. El panel
de admin la llamaba **una vez por centro**: con 165 centros eran **165 consultas** repitiendo
el mismo escaneo y los mismos joins — ~67 s de trabajo de base de datos y **~38 s de espera
en pantalla**.

`get_centers_data(p_centro_ids int[], p_date_from, p_date_to)` resuelve todos los centros de
golpe en **~250 ms**, y devuelve `centro_id` en cada fila para poder agrupar sin volver a
preguntar. Resultado medido: **38 s → 1,25 s**.

La clave del rendimiento es la **resolución del rider en dos etapas**:

1. **Etapa barata:** `LEFT JOIN riders ON driver_daily_stats.courier_uuid = riders.uber_uuid`.
   Resuelve el **99,7 %** de las filas.
2. **Etapa cara (solo el resto):** cruce por email normalizado (`canonical_email()`), primero
   contra la tabla de alias `rider_email_alias` y luego contra `riders.email`. Se aplica
   **únicamente a las filas que no cruzaron por uuid** (~36 de 2.656 en las mediciones).

Antes, el cruce por email se hacía sobre **todas** las filas y suponía el **78 %** del tiempo
de la consulta.

La función completa está en `supabase/schema.sql` y en producción
(`select pg_get_functiondef(oid) from pg_proc where proname='get_centers_data'`).
Es `STABLE SECURITY DEFINER` con `search_path` fijado.

**Recomendación para Symfony: no reescribas esto como DQL.** Llámala tal cual con una
consulta nativa. Es SQL denso, ya está afinado, ya está verificado (se comprobó que devuelve
exactamente las mismas 2.656 filas que la versión antigua, con diff vacío en ambos sentidos)
y traducirlo a ORM solo puede empeorarlo.

```php
$sql = 'select get_centers_data(:ids, :desde, :hasta)';
// devuelve un json; decodificar y agrupar por centro_id
```

### 3.3 Agregación por rider

Un rider puede tener varias filas en un rango (una por día). Se agregan así:

```
clave de agrupación = courier_uuid  (respaldo: canonical_email(email))

sumas:   num_of_trips, accept_trips, reject_trips, cancel_trips,
         cancel_not_at_fault, online_hours, active_hours

recalculados (NO se suman ni se promedian):
  tph              = num_of_trips / online_hours        (0 si online_hours = 0)
  acceptance_rate  = accept_trips / (accept_trips + reject_trips)
  cancelation_rate = cancel_trips / accept_trips
```

⚠️ Los ratios y el TPH **se recalculan sobre los totales**, nunca se promedian los ratios
diarios. Promediar ratios da números distintos y equivocados.

### 3.4 Caché

Dos tablas, TTL de **30 minutos**:

```sql
fleet_metrics_cache        (centro_id, year, week, datos jsonb, actualizado_en)  -- pk: centro_id,year,week
fleet_metrics_cache_diario (centro_id, fecha,      datos jsonb, actualizado_en)  -- pk: centro_id,fecha
```

Flujo: se leen las entradas con `actualizado_en >= now() - 30 min`; solo se consultan los
centros que faltan; el resultado se hace `upsert`. La interfaz muestra cuántos centros
salieron de caché y ofrece un botón **"Forzar (ignorar caché)"**.

### 3.5 Semana ISO y el recorte de datos asentados

El cálculo de semana es **ISO 8601** (la semana empieza en lunes). Rango a partir de
`(year, week)`:

```
simple  = 1 de enero + (week - 1) * 7 días   (en UTC)
lunes   = simple - ((díaDeLaSemana(simple) + 6) % 7)
domingo = lunes + 6
```

Hay un parámetro `acotarADatosAsentados`:

- **Panel del RIDER → `true`.** Recorta el final del rango a `hoy - 2 días` y devuelve vacío
  si la semana entera cae después. El rider no debe ver días a medio consolidar.
- **Paneles de ADMIN → `false`.** El equipo prefiere ver el día de hoy aunque venga
  incompleto, porque lo usan para decidir a quién llamar hoy. El margen de 2 días **se quitó
  a propósito** de Performance y Alertas.

⚠️ No unifiques los dos comportamientos "por limpieza": son requisitos distintos de dos
audiencias distintas.

### 3.6 "Actualizado el: ..."

Indicador en el panel con la última vez que el pipeline escribió datos:

```sql
select created_at from driver_daily_stats order by created_at desc limit 1;
```

No hay columna `updated_at` (solo `created_at`, que marca cuándo apareció la fila **por
primera vez**, no cuándo se corrigió). Es la mejor aproximación disponible hoy; si en Symfony
se quiere algo exacto, habría que pedirle al pipeline que escriba una tabla de
`ultima_ejecucion`. Requiere el rol de servicio (§3.1).

### 3.7 Orden de columnas

En **todas** las tablas del panel, la columna **rider va antes que centro**. Cambio pedido
explícitamente; mantenerlo.

---

## 4. Alertas de riders (semáforo TPH)

Pestaña dentro de Performance. Responde a: *"¿a qué riders llamo hoy?"*

### 4.1 Regla de negocio

Lista riders que **estuvieron conectados muchas horas pero hicieron pocos pedidos**:

```
online_hours >= horasMin   AND   num_of_trips < pedidosMin
```

⚠️ Es **mínimo** de pedidos (`<`), no máximo. Se cambió de "máximo" a "mínimo" a petición
expresa; la etiqueta en la interfaz dice "mínimo pedidos".

### 4.2 Semáforo de TPH

```
TPH = pedidos / horas online

rojo     : TPH < 1          (o TPH no finito)
naranja  : 1 <= TPH <= 2.35
verde    : TPH > 2.35
```

- El semáforo es **siempre visible, fuera del panel de filtros, a la derecha**, con el
  recuento de cada color. Es el filtro más usado y se aplica al instante (no requiere
  "Aplicar").
- Nunca se deja el filtro vacío: al desmarcar el último color activo, no se desmarca.
- El recuento de cada color se calcula sobre la base **antes** de aplicar el propio filtro de
  color, para que los totales no bailen al togglear.
- **El icono de alerta (triángulo) sale solo en las filas rojas.** Las filas rojas además
  llevan fondo rojo suave.
- Banner destacado cuando hay rojos: *"N trabajadores con TPH bajo"* + botón **"Ver solo
  estos"** (alterna entre solo-rojos y todos).

### 4.3 Umbrales configurables

```sql
alertas_parametros (
  id                  int  primary key default 1,   -- fila única
  horas_min_diario    numeric not null default 6,
  pedidos_min_diario  int     not null default 8,
  horas_min_semanal   numeric not null default 30,
  pedidos_min_semanal int     not null default 40,
  updated_at          timestamptz not null default now()
)
```

Valores actuales en producción para el modo semanal: **15 h y 200 pedidos** (los `default` de
la columna son los originales; la fila tiene los valores vigentes).

Solo `super_admin` puede cambiarlos.

⚠️ **Los umbrales guardados se aplican solos al entrar**, sin abrir "Filtros" y pulsar
"Aplicar". Petición explícita: son la referencia de "esto no es normal" que ha fijado el
equipo, así que entrar y ver la lista ya acotada es lo útil. Hay un botón **"Quitar filtros"**
para ver todo.

Detalle de implementación que evita un bug sutil: el auto-aplicado ocurre **solo la primera
vez** que llegan los parámetros. Si alguien pulsa "Quitar filtros" y luego cambia de diario a
semanal, los filtros **no se vuelven a encender por la espalda**.

### 4.4 Filtros, orden y paginación

- **Fuera de la caja de filtros (inmediatos):** semáforo.
- **Dentro de "Filtros", requieren "Aplicar":** mínimo de horas, mínimo de pedidos, búsqueda
  de texto (busca en nombre, DNI, email y centro).
- **Por columna:** cada cabecera permite ordenar y filtrar (texto o numérico) — rider,
  centro, email, horas, pedidos, TPH.
- **Orden por defecto:** semáforo rojo → naranja → verde y, dentro de cada color, **el TPH
  más bajo primero**. El desempate siempre es por TPH ascendente.
- **Paginación: 30 por página.** Se vuelve a la página 1 al cambiar cualquier filtro u orden.
- **Exportable** a Excel, incluyendo la columna del color del semáforo.

### 4.5 Modos diario y semanal

Ambos disponibles. ⚠️ **El selector de semana no carga automáticamente**: se elige la semana
y luego se pulsa **"Cargar"**. Petición explícita — cambiar de semana con carga automática
disparaba consultas caras a cada clic de la flecha.

Estado vacío explicativo: con umbrales semanales altos y una semana parcial es normal que no
salga nadie. En vez de una tabla vacía sin más, se muestra el motivo y un botón
**"Ver los N del periodo"** que quita el umbral.

### 4.6 Columnas

Rider (nombre + DNI) · Centro · **Email** · Horas online · Pedidos · **TPH** · Semáforo.

El email se añadió para poder contactar al rider desde la misma lista.

---

## 5. Ámbito por centros en Performance y Alertas

Cada administrador o moderador ve **solo sus centros**: la lista de centros consultables sale
de su ámbito y el selector solo ofrece esos.

⚠️ **Deuda conocida que conviene cerrar en la migración:** las funciones que devuelven las
métricas reciben `centroIds` desde el cliente y **no revalidan en servidor** que esos ids
pertenezcan al ámbito del usuario. Hoy el riesgo está mitigado porque la lista se construye
en servidor, pero una petición manipulada podría pedir centros ajenos. **En Symfony,
interseca siempre `centroIds` con el ámbito del usuario dentro del controlador**, antes de
consultar. Es una línea y cierra el agujero.

---

## 6. Comunicación de entrega de EPI (chaleco reflectante)

### 6.1 Contexto

A partir del **1 de octubre de 2026** el chaleco reflectante es obligatorio (RD 518/2026).
Además del justificante de entrega de material que ya existía, hay que generar **un documento
legal aparte** cuando se entrega un chaleco.

### 6.2 Cuándo se dispara

Solo cuando la ficha **ASIGNA** el chaleco:

```
existe un ítem con  clave = 'CHALECO_REFLECTANTE'  y  marca = 'asignacion'
```

No se genera en devoluciones (ni en buen ni en mal estado), ni si la ficha lleva cualquier
otro material.

### 6.3 Cómo se genera

Plantilla de Google Docs (`ID_PLANTILLA_EPI_CHALECO = '1UFUBkOmMULAKofY9o0HgR9Qs9Pa3ogZfrF8bmFdyf0c'`),
portada del sistema anterior en Apps Script (`STK_PLT_EPI`). El flujo:

1. Copiar la plantilla a una carpeta temporal de Drive.
2. `batchUpdate` con `replaceAllText` para los marcadores:
   `{{FECHA}}` (dd/mm/aaaa), `{{HORA}}` (HH:mm), `{{TRABAJADOR}}`, `{{DNI}}`.
3. Insertar la firma en `{{FIRMA DEL TRABAJADOR}}` — **se reutiliza la misma firma** que la
   ficha principal. La imagen se sube a Drive, se hace pública temporalmente, se inserta
   como imagen en línea (110×40 pt) y se borra. Si no hay firma, se sustituye el marcador
   por cadena vacía.
4. Exportar a PDF y subirlo a la carpeta destino de la ficha.
5. **Borrar siempre la copia temporal**, en un `finally`: nunca debe quedar un archivo
   huérfano en Drive.

A diferencia de la ficha principal, esta plantilla **no tiene tabla de materiales**, solo
marcadores simples. Por eso reutiliza la rutina de firma tal cual.

### 6.4 Tolerancia a fallos

⚠️ **Si la generación del EPI falla, la ficha NO se cae.** La ficha ya está guardada; el
error se registra en el log y se sigue. Es el mismo comportamiento del sistema anterior
(`_pltGenerarEpi_` nunca lanzaba). Un fallo de la API de Drive no puede impedir que se
registre una entrega de material.

Lo mismo para la firma: si no se encuentra el marcador o falla la inserción de la imagen,
**sale el PDF sin firma en vez de romper toda la ficha**.

### 6.5 Persistencia ⚠️

El enlace se guarda en la propia ficha:

```sql
alter table stock_fichas add column pdf_url_epi text;
```

**Por qué importa:** en la primera versión el enlace solo se devolvía en la respuesta de
creación y se mostraba una vez, en la pantalla de éxito. Si el gestor cerraba el modal, el
documento quedaba **inaccesible desde el panel para siempre**. Ahora aparece en el listado de
Fichas, junto al botón de "Ver PDF".

⚠️ **Y una trampa de RLS:** el `UPDATE` que guarda `pdf_url_epi` falló **en silencio** porque
`stock_fichas` tenía RLS con políticas de `INSERT` y `SELECT` pero **ninguna de `UPDATE`**.
Un update que no afecta filas no da error. Se resolvió creando la política
`stock_fichas_actualiza`. **Lección: cuando un update "funciona" pero el dato no cambia,
sospecha del RLS antes que del código.**

---

## 7. Centros: mapeo y duplicados "FD"

### 7.1 El problema

Varios centros aparecían **duplicados**: `FD Alicante Benidorm` junto al `ALICANTE BENIDORM`
que ya existía. Los riders se importaban al duplicado y **el centro real salía vacío en
Performance y Alertas** — ningún rider, ningún día. Afectó a 8 centros.

**Causa raíz:** el Excel de RRHH usa nombres tipo `FD Jerez`, pero en el sistema los centros
se llaman `JEREZ CENTRO`. La traducción vive en un mapa `MAPEO_CENTROS` (115 entradas). Si un
centro del Excel **no estaba en el mapa**, la importación **creaba un centro nuevo** en vez de
avisar. Faltaban 8 entradas.

### 7.2 La corrección

**a) Se completó el mapa** con las 8 entradas que faltaban (`fd alicante benidorm`,
`fd barcelona sant vicenc`, `fd braunschweig`, `fd madrid boadilla`, `fd malaga san pedro`,
`fd mallorca arenal`, `fd tarragona reus`, `fd tarragona salou`).

**b) Se migraron los datos**: los riders de los centros duplicados se movieron a los centros
correctos y los duplicados se eliminaron. El catálogo pasó de **176 a 168** centros. Se
verificó que todos los contadores pendientes quedaran a 0. (Hay una tabla de respaldo,
`_migracion_centros_fd_backup`, que se puede eliminar cuando haya confianza.)

**c) Red de seguridad general en la resolución de centro** — lo importante para el futuro:

```
si  normalizar(nombreExcel)  empieza por "fd "
y   normalizar(nombreExcel) sin el prefijo  coincide con un centro YA EXISTENTE
→   usar ese centro
```

⚠️ **Solo actúa si el nombre sin prefijo coincide con algo que ya existe: nunca inventa.**
Los centros alemanes (`FD Hamburg`, `FD Berlin`...), que no tienen gemelo sin prefijo, siguen
su camino normal y se crean como siempre.

### 7.3 Orden completo de resolución de centro (a replicar tal cual)

```
1. MAPEO_CENTROS[normalizar(nombreExcel)] → buscar ese nombre oficial en el catálogo
2. buscar normalizar(nombreExcel) directamente en el catálogo
3. red de seguridad "fd ": quitar el prefijo y buscar; solo si ya existe
4. si empieza por "mcd" → crear centro + ciudad con ese nombre
5. si empresa_contratante == "closer go germany gmbh" → crear centro + ciudad (país DE)
6. cualquier otro → crear centro sin ciudad
```

Normalización (usada en todas las comparaciones):

```
trim → minúsculas → NFD → quitar diacríticos → colapsar espacios múltiples a uno
```

Los centros que empiezan por `MCD` en el Excel **no se importan como riders** (se filtran
antes, en la lectura del xlsx): son de otra operación.

---

## 8. Otros cambios menores del mismo periodo

- **Renombrado "Métricas Operativas" → "Performance"** en navegación y título de página.
  (Al principio solo se renombró la pestaña interna; hay que cambiar **las tres**: entrada de
  menú, título de página y pestaña.)
- **Modificar anuncios**: además de publicar y desactivar, ahora se pueden **editar**
  (mensaje, mensaje en inglés y audiencia).
- **Borrado definitivo de riders**: ya existía, solo `super_admin`, de uno en uno. Borra la
  fila de `riders` y su usuario de autenticación. Si falla el borrado del usuario de auth, la
  fila **ya se borró** y se avisa del problema sin revertir (dejarlo a medias sería peor).
  *Se decidió no ampliar esto a borrado en lote por ahora.*
- **Dato conocido para más adelante:** hay **6.973 riders con `activo = true` pero 260 con
  `fecha_baja` ya pasada**. El flag `activo` no se actualiza desde el dato de RRHH. Merece un
  saneamiento, no se ha tocado.

---

## 9. Cosas transversales a decidir pronto en Symfony

### 9.1 i18n

Hoy hay dos diccionarios (`es`, `en`) y **el compilador obliga a que tengan exactamente las
mismas claves**: el tipo de clave se deriva del diccionario español, así que si falta una
traducción en inglés, **el build falla** y nunca se despliega media traducción.

Esa red de seguridad es valiosa y se pierde con los YAML de Symfony. Recomendación: un test
que compare los conjuntos de claves de `messages.es.yaml` y `messages.en.yaml` y falle si
difieren. Cuesta diez líneas y evita una clase entera de bugs.

Nombres de motivos y anuncios llevan columna `nombre_en` aparte: la traducción de contenido
vive en la base de datos, no en los ficheros de idioma.

### 9.2 Caché

Lo que hay hoy, por si se quiere replicar:

| Qué | Dónde | TTL |
|---|---|---|
| Catálogos (motivos, motivos de ausencia) | caché del framework | hasta invalidar |
| Usuario/admin/rider actual | memoria, por petición | la petición |
| Métricas de flota | tablas `fleet_metrics_cache*` | 30 min |
| Carpetas de Drive | tabla `google_drive_folder_cache` | permanente |
| Token de la API de overtime | memoria del proceso | 45 min |

La caché por petición (evitar resolver el usuario N veces en una misma petición) la da
Symfony gratis con servicios; las de base de datos se migran tal cual.

### 9.3 Migraciones de base de datos ⚠️

**El directorio `supabase/` está en `.gitignore`.** Los cambios de esquema de este periodo
—el valor `papelera` en el enum `estado_ausencia`, las columnas de papelera en `ausencias`,
la vista `papelera_items`, la columna `pdf_url_epi`, la política `stock_fichas_actualiza`—
**están aplicados en producción pero no versionados en git**. `supabase/schema.sql` es una
referencia local, no una fuente de verdad.

**Aprovecha la migración para arreglar esto.** Symfony trae Doctrine Migrations: genera una
migración inicial a partir del esquema real de producción y, a partir de ahí, ningún cambio
de esquema sin migración versionada.

```bash
pg_dump --schema-only "$DATABASE_URL" > esquema_actual.sql   # punto de partida fiable
```

### 9.4 Server Actions → Controllers

Las Server Actions son funciones de servidor invocadas directamente desde el cliente. En
Symfony pasan a ser endpoints. Al traducirlas, ten en cuenta:

- **Devuelven estado, no excepciones**, para los formularios: `{ error: string }` o
  `{ success: true }`. Conviene mantener ese contrato (respuesta JSON) para que el front
  muestre errores sin páginas de error.
- **`revalidatePath()` no tiene equivalente directo.** Hoy marca qué rutas refrescar tras una
  mutación. En Symfony normalmente es un redirect tras POST, o invalidar la caché HTTP de esa
  ruta. Anota, por cada acción, qué pantallas deben verse actualizadas después.
- **Toda acción de gestión valida el rol primero** y muchas escriben en `auditoria`. No es
  opcional: es el rastro de quién hizo qué.

---

## 10. Checklist de verificación

Lo que hay que poder demostrar antes de dar por migrada cada parte. Basado en lo que
realmente se verificó aquí.

**Autorización (lo primero, y con datos reales):**
- [ ] Un moderador con un solo centro asignado ve **solo** ese centro en: Incidencias,
      Ausencias, Papelera, Riders, Performance, Alertas, Auditoría, Stock.
- [ ] Sin sesión, ninguna consulta devuelve filas.
- [ ] Un `centroIds` manipulado en la petición de métricas no devuelve centros ajenos.

**Papelera:**
- [ ] El total coincide con `select count(*) from papelera_items` (hoy ~4.848).
- [ ] **La última página carga** (es la prueba de que no hay tope de filas escondido).
- [ ] Filtro por tipo funciona combinado con la paginación.
- [ ] Enviar a papelera → aparece con quién y cuándo → recuperar → vuelve a la lista.
- [ ] Las listas de Incidencias y Ausencias **no** muestran lo que está en papelera.

**Duplicados:**
- [ ] Enviar dos veces la misma ausencia en menos de 2 minutos crea **una** fila.
- [ ] El segundo envío **no** sube ficheros a Drive.
- [ ] Un motivo sin `codigo_pedido` también se protege.

**Performance / Alertas:**
- [ ] Cargar todos los centros tarda ~1 s, no ~38 s (si tarda 38, estás llamando a
      `get_center_data` en bucle).
- [ ] El TPH de un rider con varios días coincide con `total pedidos / total horas`,
      no con la media de los TPH diarios.
- [ ] Los umbrales guardados salen ya aplicados al entrar, sin tocar "Filtros".
- [ ] El selector de semana **no** dispara la consulta hasta pulsar "Cargar".
- [ ] "Actualizado el" muestra una fecha real.

**EPI:**
- [ ] Una ficha que asigna chaleco genera el PDF **y** el enlace sigue visible en el listado
      de Fichas al día siguiente.
- [ ] Una ficha que devuelve chaleco **no** genera nada.
- [ ] Un fallo de Drive no impide guardar la ficha.
- [ ] No quedan archivos temporales en la carpeta de Drive.

**Centros:**
- [ ] Importar un Excel con `FD Alicante Benidorm` asigna al centro existente
      `ALICANTE BENIDORM`, **sin crear uno nuevo**.
- [ ] Importar `FD Hamburg` sigue creando/usando el centro alemán.
- [ ] El catálogo sigue en 168 centros después de una importación.

---

## 11. Dónde mirar el original

| Tema | Fichero |
|---|---|
| Papelera unificada | `app/dashboard/papelera/page.tsx` |
| Acciones de papelera (ausencias) | `app/dashboard/ausencias/actions.ts` |
| Acciones de papelera (incidencias) | `app/dashboard/actions.ts` |
| Guardas anti-duplicados | `app/rider/dashboard/actions.ts` |
| Capa de métricas | `lib/fleetMetricsSupabase.ts` |
| Acciones de métricas y alertas | `app/dashboard/metricas/actions.ts` |
| Panel de alertas (toda la UI) | `components/metricas/AlertasRidersPanel.tsx` |
| Generación de documentos | `lib/googleDocs.ts` |
| Fichas de stock / EPI | `app/dashboard/stock/actions.ts` |
| Mapa de centros | `lib/mapeoCentros.ts` |
| Resolución de centro al importar | `app/dashboard/riders/actions.ts` |
| Esquema de referencia | `supabase/schema.sql` (⚠️ no versionado, ver §9.3) |

Y, para lo que no esté aquí, **la base de datos de producción es la fuente de verdad**:

```sql
select tablename, policyname, cmd, qual from pg_policies order by 1,3;   -- reglas de acceso
select proname, pg_get_functiondef(oid) from pg_proc
  where pronamespace = 'public'::regnamespace;                            -- funciones
select enum_range(null::estado_ausencia);                                 -- valores de enums
```
