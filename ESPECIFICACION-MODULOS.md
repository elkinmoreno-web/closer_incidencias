# Especificación funcional — 4 módulos de Closer CRM

Documento para reimplantar estos módulos en otro proyecto. Describe **qué hace cada
uno, de qué datos vive, qué calcula y qué enseña**. No es un volcado de código: los
nombres de tabla y columna que aparecen son los nuestros, y sirven para que busques
el equivalente en tu base.

Módulos cubiertos:

1. [Períodos de prueba](#1-períodos-de-prueba)
2. [Performance](#2-performance)
3. [Horas Extra](#3-horas-extra)
4. [CH vs WH](#4-ch-vs-wh)

---

## Lo primero: de dónde vienen los datos

Los cuatro módulos **no beben de la misma fuente**, y esto es lo que más condiciona
la implementación:

| Módulo | Origen de los datos |
|---|---|
| Períodos de prueba | **Tu propia base**, tabla de riders. Solo hace cuentas con una fecha. |
| Performance | **Tabla de estadísticas diarias** que rellena un proceso externo (nuestro pipeline de Python lee los CSV de Uber y los escribe). |
| Horas Extra | **API externa** del backoffice de turnos. Se descarga y se guarda en una tabla propia. |
| CH vs WH | **La misma API externa**, otra lectura de los mismos turnos. Solo se cachea. |

Si en tu base ya tienes los datos —que es lo que me dices—, tu trabajo es sobre todo:

- **Performance** → encontrar tu tabla de estadísticas por rider y día.
- **Horas Extra / CH vs WH** → encontrar tu tabla de turnos/horarios por empleado y día.
- **Períodos de prueba** → localizar la fecha de alta de cada rider.

### Conceptos comunes a todos

**Visibilidad por zona.** Un gestor no ve todos los centros: ve los de las ciudades que
tiene asignadas. El super admin los ve todos. Todos los módulos aplican este filtro
antes de consultar nada.

> Nuestras tablas: `admins` → `admin_ciudades` → `ciudades` → `centros`.

**La semana es ISO y empieza en lunes.** Todos los módulos semanales se parametrizan
con `(año, número de semana ISO)` o con la fecha del lunes. Es importante ser
consistente: mezclar semanas ISO con semanas naturales descuadra las comparaciones.

**Cachés con dos condiciones, no solo TTL.** Donde hay caché, no basta con "vale 30
minutos". Si un proceso externo escribe los datos, la caché tiene que ser además
**posterior a la última escritura de ese proceso**. Nos mordió en producción: se
cacheó un día con la carga a medias y el panel enseñó 419 riders de 3.223 reales
durante media hora. Detalle en [Performance](#la-caché-necesita-dos-condiciones).

---

## 1. Períodos de prueba

El más simple de los cuatro: **no tiene pantalla propia ni tabla propia**. Es una
columna calculada dentro del listado de riders.

### Qué hace

Indica en qué punto del período de prueba está cada rider recién incorporado, con un
semáforo, para que el gestor sepa a quién tiene que evaluar antes de que se le pase
el plazo.

### De qué datos vive

Solo necesita **una fecha de alta por rider**.

> Nuestra columna: `riders.fecha_alta`.

### Qué calcula

Duración del período: **45 días naturales** desde la fecha de alta. Es una constante
en un único sitio del código, para poder cambiarla sin buscarla por ahí.

```
diasTranscurridos = hoy − fecha_alta        (en días naturales)
fechaFin          = fecha_alta + 45 días
diasRestantes     = 45 − diasTranscurridos  (puede ser negativo)
```

Semáforo:

| Estado | Condición | Significado |
|---|---|---|
| `verde` | 0–15 días | Recién entrado, sin prisa |
| `naranja` | 16–30 días | A mitad, conviene ir mirándolo |
| `rojo` | 31–45 días | Se acerca el límite, hay que decidir |
| `finalizado` | más de 45 días | Ya pasó el plazo |
| `sin_fecha` | no hay fecha de alta | No se puede calcular |

### Qué enseña

Una columna en la tabla de riders con el semáforo, los días transcurridos y la fecha
límite.

### Trampas

- **`hoy` tiene que calcularse en la zona horaria del negocio** (para nosotros
  Europe/Madrid), no en UTC ni en la del servidor. Si no, a ciertas horas el contador
  salta un día antes o después de lo que ve el gestor.
- **Sin fecha de alta hay que decirlo explícitamente**, no enseñar un hueco: el hueco
  parece un fallo de la pantalla y nadie lo reporta.
- Días **naturales**, no laborables.

---

## 2. Performance

El módulo más grande y el más delicado. Mide el rendimiento de cada rider sobre los
datos de actividad que llegan de Uber.

### Qué hace

Enseña, por centro y por semana (o por un día suelto), una fila por rider con sus
horas, viajes y ratios, con un semáforo sobre el TPH para localizar de un vistazo a
quién rinde por debajo del mínimo.

### De qué datos vive

Una tabla de **estadísticas por rider y día**, escrita por un proceso externo. La
clave natural es `(identificador del rider en la plataforma, día)`.

> Nuestra tabla `driver_daily_stats`, una fila por `(courier_uuid, day)`:
>
> | Columna | Qué es |
> |---|---|
> | `day` | Día de la actividad |
> | `courier_uuid` | Id del rider **en Uber** (no el nuestro) |
> | `driver_name`, `driver_number`, `email` | Datos que vienen de Uber |
> | `city` | Mercado/zona de Uber |
> | `num_of_trips` | Viajes del día |
> | `online_hours` | Horas conectado |
> | `active_hours` | Horas en actividad (con pedido) |
> | `accept_trips`, `reject_trips` | Pedidos aceptados / rechazados |
> | `cancel_trips`, `cancel_not_at_fault` | Cancelados (total / sin culpa) |
> | `tph`, `pct_accept`, `pct_cancel` | Ya calculados por día |

Y necesita **cruzar cada fila con el rider de tu base**, que es la parte difícil.

### El cruce rider ↔ estadísticas: lo más importante de este módulo

Las filas de actividad vienen identificadas por el id de Uber, no por el tuyo. Hay
que casarlas con tu maestro de riders. Lo resolvemos **en tres escalones, en orden**:

1. **Por id de plataforma.** `estadisticas.courier_uuid = rider.uber_uuid`.
   Resuelve el ~99,7% de las filas y es barato.
2. **Por tabla de alias de correo.** Para las que no cruzaron: una tabla
   `rider_email_alias (email_uber → rider_id)` que el gestor rellena a mano cuando
   detecta un caso.
3. **Por correo normalizado.** Último recurso: comparar el correo de la estadística
   con el del rider, ambos pasados por una función de canonicalización (minúsculas,
   sin espacios, quitando el sufijo `+algo` de Gmail).

**Haz los escalones 2 y 3 SOLO sobre las filas que fallaron el 1.** Aplicarlos a
todas las filas nos costaba el 78% del tiempo de la consulta.

Y **cuando una fila no cruza con ningún rider, dilo en la pantalla**. Nosotros
pintamos `⚠ sin cruzar (correo@ejemplo.com)` en la columna del DNI. Un hueco vacío no
se investiga; un aviso con el correo sí, y es la señal de que hay que dar de alta un
alias.

### Qué calcula

Los datos vienen por día; el panel los agrega **por rider** dentro del rango pedido
(una semana o un día).

**Se suman** las cantidades absolutas: viajes, horas online, horas activas,
aceptados, rechazados, cancelados.

**Se recalculan** los ratios sobre los totales sumados — nunca se promedian los
ratios diarios, que daría un número distinto y mal:

```
tph              = total_viajes / total_horas_online
tasa_aceptacion  = aceptados / (aceptados + rechazados)
tasa_cancelacion = cancelados / aceptados
```

Si el denominador es 0, el resultado es 0 (no infinito ni nulo).

**Semáforo del TPH:**

| Color | Rango | |
|---|---|---|
| 🔴 rojo | TPH < 1 | Por debajo del mínimo exigido |
| 🟠 naranja | 1 ≤ TPH ≤ 2,35 | Aceptable |
| 🟢 verde | TPH > 2,35 | Bien |

**Umbrales de ruido configurables.** Antes de aplicar el semáforo se descartan los
riders con actividad insignificante: a quien se conectó 20 minutos no tiene sentido
evaluarlo. Los umbrales viven en una tabla de parámetros, distintos para vista
diaria y semanal.

> Nuestra tabla `alertas_parametros`: `horas_min_diario`, `pedidos_min_diario`,
> `horas_min_semanal`, `pedidos_min_semanal`.

### Qué enseña

Tabla con una fila por rider: centro, DNI, nombre, teléfono, correo, horas online,
horas activas, viajes, % aceptación, % cancelación y TPH.

Controles: selector de centros (limitado a la zona del gestor), selector de semana o
día, buscador por nombre/DNI/correo, filtro por color del semáforo, ordenación por
cualquier columna (por defecto, los rojos primero), y un botón de forzar recarga que
salta la caché.

También hay una **vista para el propio rider**, que ve solo sus datos: su resumen
semanal y el desglose por días.

### La caché necesita dos condiciones

Las respuestas por centro y semana son grandes (más de 1 MB), así que se cachean en
una tabla `(centro, año, semana) → datos, actualizado_en`.

Una caché normal por TTL **no basta** cuando quien escribe los datos es un proceso
externo. Nuestro caso real: se cacheó a las 10:58 con la jornada a medias, el
pipeline terminó a las 11:01, y durante 30 minutos el panel enseñó una fracción de
los riders.

La regla que lo arregla: la caché vale si se creó **después del más tardío de estos
dos momentos**:

```
limite = max( ahora − TTL ,  última escritura del proceso externo )
```

### Trampas

- **Nunca promedies ratios diarios.** Suma los absolutos y recalcula.
- **Una consulta para todos los centros, no una por centro.** Teníamos 165 consultas
  repitiendo el mismo escaneo y los mismos joins.
- **Filtra por centro lo antes posible.** Nuestra función individual aplicaba el
  filtro *después* de los joins y acabó consumiendo el 38% de la CPU de la base:
  calculaba 55.783 filas para quedarse con 691.
- Un rider puede aparecer en **varios mercados el mismo día**: si tu origen trae una
  fila por mercado, súmalas, no te quedes con una.

---

## 3. Horas Extra

### Qué hace

Lista las horas extra que los riders tienen asignadas en el sistema de turnos, y
permite al gestor **auditarlas una a una**: confirmarlas o rechazarlas. Es el paso
previo a que se paguen.

### De qué datos vive

De los **turnos planificados por empleado y día**. En nuestro caso vienen de una API
externa; si tú ya los tienes en tu base, es tu tabla de horarios.

Lo que necesita cada franja horaria:

| Dato | Para qué |
|---|---|
| Empleado (usuario, nombre, apellido) | Identificar de quién es |
| Fecha y día de la semana | Agrupar por semana |
| Hora de inicio y fin | Calcular la duración |
| **Marca de "es hora extra"** | Solo interesan estas |
| **Marca de activo/desactivado** | Las desactivadas no cuentan |
| **Zona de trabajo** | Distinguir Uber de OnDemand (ver abajo) |

Nosotros lo guardamos en `overtime_registros`, con la auditoría incluida:

```
centro_id, rider_usuario, rider_nombre, rider_apellido,
fecha, dia_semana, zona, horario,
horas_uber, horas_ondemand, horas_total,
estado, auditado_por, auditado_en, actualizado_en
```

### Qué calcula

Para cada empleado y día, se toman **solo las franjas que son hora extra Y están
activas**, y se suman sus minutos.

**El reparto Uber / OnDemand es la regla clave**, y es contraintuitiva:

```
si la franja NO tiene zona de trabajo asignada  → son horas de UBER
si la franja SÍ tiene zona de trabajo           → son horas de ONDEMAND
```

Es decir, **la ausencia de zona es lo que marca que es Uber**. Ojo con tratar el
campo vacío como "dato que falta": aquí significa algo.

A partir de ahí:

```
horasUber     = minutos sin zona / 60
horasOnDemand = minutos con zona / 60
horasTotal    = horasUber + horasOnDemand

zona = "Mixto"    si hay de los dos
     = "Uber"     si solo sin zona
     = "OnDemand" si solo con zona
```

Los días sin ninguna franja extra **no generan fila**.

El campo `horario` es solo texto legible: las franjas concatenadas, `"09:00-11:00 / 14:00-15:30"`.

### Qué enseña

Tabla por semana: centro, rider, usuario, día, fecha, zona, horario, horas Uber,
horas OnDemand, horas totales, estado de auditoría y quién/cuándo lo auditó.

**La acción principal es auditar**: cada fila se marca como `Pendiente`, `Confirmado`
o `Rechazado`, y queda registrado qué gestor lo hizo y cuándo.

### Trampas

- **El estado de auditoría es tuyo, no del origen.** Al refrescar desde la API hay
  que hacer *upsert* conservando `estado`, `auditado_por` y `auditado_en`. Si los
  sobrescribes, el gestor pierde todo el trabajo de revisión.
- **Los booleanos de la API llegan en varios formatos**: `true`, `"true"`, `0`… Hay
  que normalizarlos o se cuelan franjas desactivadas.
- **Frescura corta.** Nosotros re-consultamos si los datos guardados tienen más de 5
  minutos. Es un módulo que se mira mientras se está editando el cuadrante.
- **Concurrencia limitada.** La API no tiene endpoint en bloque: hay que pedir centro
  por centro. Lo hacemos en paralelo con un máximo de 5 a la vez.

---

## 4. CH vs WH

Hermano de Horas Extra: **lee exactamente los mismos turnos, pero responde otra
pregunta**.

### Qué hace

Compara, por rider y semana, las **horas de contrato (CH, *contract hours*)** con las
**horas realmente trabajadas (WH, *worked hours*)**, y enseña el desfase. Sirve para
detectar a quién se le está pidiendo de más o de menos respecto a lo que tiene
firmado.

### De qué datos vive

Los mismos turnos que Horas Extra, más dos datos del empleado:

| Dato | Qué es |
|---|---|
| `contractHours` | Horas semanales de contrato → **CH** |
| `weeklyWorkMinutes` | Minutos trabajados esa semana → **WH** (÷60) |
| Franjas marcadas como extra y activas | Para las horas extra |
| Eventos de calendario (`scheduleEvents`) | Bajas, vacaciones, incidencias |

### Qué calcula

Se agrega **por usuario y semana** (no por día):

```
CH        = horas de contrato semanales
WH        = minutos trabajados en la semana / 60
balance   = WH − CH          (positivo = trabajó de más)
horasExtra = suma de minutos de las franjas extra activas / 60
```

Además:

- **`eventos`**: el conjunto de nombres distintos de eventos de calendario de esa
  semana (bajas, vacaciones, permisos…), sin repetir.
- **`diasIncidencia`**: cuántos días de la semana tienen al menos un evento.
- **`calculaHorario`** (Sí/No): un indicador por rider que dice si su horario se
  calcula automáticamente. Se resuelve con **una llamada por rider**, así que va
  aparte y con su propia caché persistente — si no, este módulo se vuelve inusable.

### Qué enseña

Tabla por semana: centro, rider, usuario, CH, WH, balance, horas extra, si calcula
horario, eventos y días con incidencia.

Lo que se mira primero es el **balance**: los muy positivos (trabajando de más) y los
muy negativos (contrato infrautilizado).

### Trampas

- **`balance` no es lo mismo que `horasExtra`.** El balance sale de comparar contrato
  y trabajo real; las horas extra son franjas marcadas explícitamente como tales. Un
  rider puede tener balance positivo sin ninguna hora extra registrada, y eso
  precisamente es lo interesante de mirar.
- **Los eventos hay que desduplicar por nombre**, y el tipo puede venir como texto o
  como objeto `{name}` según el registro.
- **La caché aquí sí es un TTL simple** (30 min), porque no hay ningún proceso
  externo escribiendo por debajo: el origen es la API y se consulta bajo demanda.

---

## Resumen para planificar el trabajo

| Módulo | Dificultad | Dónde está el trabajo de verdad |
|---|---|---|
| Períodos de prueba | Baja | Nada más que una resta de fechas y un semáforo |
| Performance | **Alta** | El cruce rider↔estadísticas y el rendimiento de la consulta |
| Horas Extra | Media | La regla Uber/OnDemand y preservar la auditoría al refrescar |
| CH vs WH | Media | Agregar por semana y el indicador que cuesta una llamada por rider |

Si vas a hacerlos en orden, **Horas Extra y CH vs WH conviene hacerlos juntos**:
leen la misma fuente y comparten el filtro de centros por zona y el patrón de
descarga con concurrencia limitada. Reutilizarás casi todo.
