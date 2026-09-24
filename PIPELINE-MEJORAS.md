# Mejoras para el pipeline (GitHub Actions)

Dos cambios. El primero arregla el problema de los correos a medias; el segundo hace
que un fallo del pipeline se vea en Actions en vez de pasar como verde.

La tabla `pipeline_cargas` **ya está creada** en Supabase, así que solo hay que tocar
el Python.

---

## 1. Escribir la marca de "día cerrado"

**El problema.** `sync_to_supabase` sube en lotes de 1.000 filas con UPSERT. El CRM
miraba `max(created_at)` de `driver_daily_stats` para decidir si podía mandar el aviso
de TPH, así que **en cuanto aterrizaba el primer lote ya daba verde** — con miles de
filas todavía por subir. Resultado real de los últimos días:

| Día | Hora de envío | Correos enviados |
|---|---|---|
| 21-sep lun | 11:44 | **214** ← el pipeline acabó tarde, datos completos |
| 22-sep mar | 10:00 | 22 |
| 23-sep mié | 10:00 | 42 |
| 24-sep jue | 09:30 | 28 |

El 21 salió bien porque el pipeline terminó *antes* del último intento del cron. Los
otros tres días el cron se adelantó y calculó el TPH sobre una jornada a medias.

**La solución.** Que el pipeline diga explícitamente "este día ya está entero", en vez
de que el CRM lo adivine.

### Cambio en `sync_to_supabase`

Sustituye el bucle de subida (el bloque que empieza en `TAMANO_LOTE = 1000`) por esto:

```python
    # 1000 filas por petición (~250 KB): la mitad de viajes de ida y vuelta a
    # Irlanda que con lotes de 500, muy por debajo del límite de tamaño.
    TAMANO_LOTE = 1000
    subidos = 0
    for i in range(0, len(registros), TAMANO_LOTE):
        lote = registros[i:i + TAMANO_LOTE]
        supabase.table('driver_daily_stats').upsert(lote, on_conflict='courier_uuid,day').execute()
        subidos += len(lote)
        print(f'[sync_to_supabase] {subidos}/{len(registros)} filas sincronizadas')

    print(f'[sync_to_supabase] {subidos} filas sincronizadas a Supabase (ventana: ultimos {ventana_dias} dias)')

    # Marca de "día cerrado". Va DESPUÉS del bucle a propósito: solo se
    # escribe si TODOS los lotes han subido bien. Si el proceso muere a
    # medias, la marca se queda con la fecha de ayer y el CRM sabe que el
    # día no está listo, en vez de mandar avisos sobre una jornada parcial.
    conteos = {}
    for r in registros:
        conteos[r['day']] = conteos.get(r['day'], 0) + 1

    ahora = datetime.now(timezone.utc).isoformat()
    supabase.table('pipeline_cargas').upsert(
        [{'dia': dia, 'filas': n, 'cerrado_en': ahora} for dia, n in conteos.items()],
        on_conflict='dia',
    ).execute()
    print(f'[sync_to_supabase] Marcados como cerrados {len(conteos)} dias: {sorted(conteos)}')
```

### Un import más

En la cabecera, cambia:

```python
from datetime import datetime, date, timedelta
```

por:

```python
from datetime import datetime, date, timedelta, timezone
```

---

## 2. Que un fallo se vea en Actions

**El problema.** En `main()`:

```python
    bronze_daily = ingest_bronze_daily()
    if bronze_daily is None:
        print("\n✗ No hay datos de COURIER_DAILY. Abortando.")
        return
```

Ese `return` sale de `main()` con normalidad, el script termina con **código 0** y
**GitHub Actions lo marca en verde** aunque no haya ingerido absolutamente nada. Un
fallo de descarga se ve igual que una ejecución correcta.

**La solución.** Salir con código de error:

```python
    bronze_daily = ingest_bronze_daily()
    if bronze_daily is None:
        print("\n✗ No hay datos de COURIER_DAILY. Abortando.")
        sys.exit(1)   # que Actions lo marque en rojo: un 'return' salía en verde
```

Y añade `import sys` arriba, junto a `import os`.

---

## Qué pasa en el CRM

Ya está desplegable por mi parte. `datosFrescos` ahora:

1. Mira `pipeline_cargas` para el día que va a analizar. Si está cerrado hoy → envía.
2. Si no hay marca (mientras no subas este cambio), estima por volumen: compara las
   filas del día contra la **mediana del mismo día de la semana** de las 3 semanas
   anteriores, y exige un 85%.

Tiene que ser el mismo día de la semana: la demanda sigue un patrón semanal fuerte
—un domingo mueve ~3.100 filas y un martes ~1.950— así que comparar contra "ayer"
daría falsos positivos cada lunes y cada sábado.

Calibrado contra 35 días: el peor día completo queda al 100% y el único por debajo
es el 23-sep al 68%. Cero bloqueos falsos.

En cuanto subas la marca, esa estimación deja de usarse y la decisión pasa a ser exacta.
