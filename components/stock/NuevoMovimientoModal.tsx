'use client';

import { useMemo, useState, useTransition } from 'react';
import { X, ChevronLeft, Package, ArrowRight, Check } from 'lucide-react';
import { registrarMovimientoStock } from '@/app/dashboard/stock/actions';
import type { StockMaterial, StockTipoMovimiento, Centro } from '@/lib/types';
import { useIdioma } from '@/components/i18n/IdiomaProvider';
import { nombreSegunIdioma } from '@/lib/i18n/traducir';
import { BuscadorRiderRemoto } from '@/components/shared/BuscadorRiderRemoto';
import type { RiderResultado } from '@/app/dashboard/buscarRiders';

const TIPOS_CON_RIDER = new Set(['ENTREGA_RIDER', 'DEVOLUCION_OK', 'DEVOLUCION_ROTA', 'NO_RECUPERADA', 'RIDER_YA_TIENE_SOPORTE', 'RECUPERADA_ROBO']);
// Solo estos dos tipos manejan "cajas + unidades sueltas" — mismo
// criterio que TIPOS_CON_CAJAS del backend (app/dashboard/stock/actions.ts).
const TIPOS_CON_CAJAS = new Set(['ENTRADA_PROVEEDOR', 'ENVIO_SUCURSAL']);
// RIDER_YA_TIENE_SOPORTE es puramente informativo — nunca mueve
// stock (portado de _stkRegistrar: "cajas = 0; unidades = 0" fijo,
// sin importar lo que se escriba) — se oculta el campo de cantidad
// para no dar a entender que hace algo con el inventario.
const TIPO_NEUTRO_SIN_CANTIDAD = 'RIDER_YA_TIENE_SOPORTE';

type Paso = 'tipo' | 'detalle' | 'confirmar';

/**
 * Flujo en 3 pasos (Tipo → Detalle → Confirmar) en vez de un
 * formulario largo de una sola pantalla — reduce cuántos campos se
 * ven a la vez, da contexto claro en cada paso (iconos, resumen en
 * vivo) y cierra con una confirmación explícita antes de guardar.
 */
export function NuevoMovimientoModal({
  material,
  materiales,
  tipos,
  centros,
  onCerrar,
  onRegistrado,
}: {
  material: StockMaterial;
  materiales: StockMaterial[];
  tipos: StockTipoMovimiento[];
  centros: Centro[];
  onCerrar: () => void;
  onRegistrado: () => void;
}) {
  const { t, idioma } = useIdioma();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [paso, setPaso] = useState<Paso>('tipo');

  const [materialId, setMaterialId] = useState(material.id);
  const [tipoClave, setTipoClave] = useState('');
  const [centroOrigenId, setCentroOrigenId] = useState('');
  const [centroDestinoId, setCentroDestinoId] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [cajas, setCajas] = useState('');
  const [sueltas, setSueltas] = useState('');
  const [tallaM, setTallaM] = useState('');
  const [tallaL, setTallaL] = useState('');
  const [tallaXl, setTallaXl] = useState('');
  const [tallaXxl, setTallaXxl] = useState('');
  const [cajaTallaM, setCajaTallaM] = useState('');
  const [cajaTallaL, setCajaTallaL] = useState('');
  const [cajaTallaXl, setCajaTallaXl] = useState('');
  const [cajaTallaXxl, setCajaTallaXxl] = useState('');
  const [sueltaTallaM, setSueltaTallaM] = useState('');
  const [sueltaTallaL, setSueltaTallaL] = useState('');
  const [sueltaTallaXl, setSueltaTallaXl] = useState('');
  const [sueltaTallaXxl, setSueltaTallaXxl] = useState('');
  const [riderNombreLibre, setRiderNombreLibre] = useState('');
  const [riderElegido, setRiderElegido] = useState<RiderResultado | null>(null);
  const [notas, setNotas] = useState('');
  const [usaCorreos, setUsaCorreos] = useState(false);

  const materialSeleccionado = materiales.find((m) => m.id === materialId) ?? material;
  const tipo = tipos.find((tp) => tp.clave === tipoClave);
  const mostrarRider = tipo ? TIPOS_CON_RIDER.has(tipo.clave) : false;
  const modoCajas = tipo ? TIPOS_CON_CAJAS.has(tipo.clave) : false;

  function alElegirRider(r: RiderResultado | null) {
    setRiderElegido(r);
    if (!r || !r.centroId) return;
    if (tipo?.requiere_origen && !centroOrigenId) setCentroOrigenId(String(r.centroId));
    if (tipo?.requiere_destino && !centroDestinoId) setCentroDestinoId(String(r.centroId));
  }

  const num = (v: string) => Math.max(0, Number(v) || 0);

  // Total de unidades calculado en vivo, con el mismo criterio que el
  // backend — así el resumen del paso 3 nunca se desincroniza de lo
  // que realmente se va a guardar.
  const totalUnidades = useMemo(() => {
    if (materialSeleccionado.tiene_tallas) {
      if (modoCajas) {
        const udsPorCaja = materialSeleccionado.uds_por_caja;
        return (
          num(cajaTallaM) * udsPorCaja + num(sueltaTallaM) +
          num(cajaTallaL) * udsPorCaja + num(sueltaTallaL) +
          num(cajaTallaXl) * udsPorCaja + num(sueltaTallaXl) +
          num(cajaTallaXxl) * udsPorCaja + num(sueltaTallaXxl)
        );
      }
      return num(tallaM) + num(tallaL) + num(tallaXl) + num(tallaXxl);
    }
    if (modoCajas) return num(cajas) * materialSeleccionado.uds_por_caja + num(sueltas);
    return num(cantidad);
  }, [materialSeleccionado, modoCajas, cajas, sueltas, cantidad, tallaM, tallaL, tallaXl, tallaXxl, cajaTallaM, cajaTallaL, cajaTallaXl, cajaTallaXxl, sueltaTallaM, sueltaTallaL, sueltaTallaXl, sueltaTallaXxl]);

  const totalCajas = useMemo(() => {
    if (!modoCajas) return 0;
    if (materialSeleccionado.tiene_tallas) return num(cajaTallaM) + num(cajaTallaL) + num(cajaTallaXl) + num(cajaTallaXxl);
    return num(cajas);
  }, [modoCajas, materialSeleccionado, cajas, cajaTallaM, cajaTallaL, cajaTallaXl, cajaTallaXxl]);

  const totalSueltas = useMemo(() => {
    if (!modoCajas) return 0;
    if (materialSeleccionado.tiene_tallas) return num(sueltaTallaM) + num(sueltaTallaL) + num(sueltaTallaXl) + num(sueltaTallaXxl);
    return num(sueltas);
  }, [modoCajas, materialSeleccionado, sueltas, sueltaTallaM, sueltaTallaL, sueltaTallaXl, sueltaTallaXxl]);

  const nombreCentro = (id: string) => centros.find((c) => String(c.id) === id)?.nombre ?? '';

  function puedeAvanzarDeDetalle(): boolean {
    if (tipo?.requiere_origen && !centroOrigenId) return false;
    if (tipo?.requiere_destino && !centroDestinoId) return false;
    if (centroOrigenId && centroDestinoId && centroOrigenId === centroDestinoId) return false;
    if (tipo?.clave === TIPO_NEUTRO_SIN_CANTIDAD) return true;
    return totalUnidades > 0;
  }

  function guardar() {
    setError(null);
    startTransition(async () => {
      const res = await registrarMovimientoStock({
        materialId,
        tipoClave,
        centroOrigenId: centroOrigenId ? Number(centroOrigenId) : null,
        centroDestinoId: centroDestinoId ? Number(centroDestinoId) : null,
        cantidad: cantidad ? Number(cantidad) : 0,
        cajas: cajas ? Number(cajas) : 0,
        sueltas: sueltas ? Number(sueltas) : 0,
        tallaM: tallaM ? Number(tallaM) : 0,
        tallaL: tallaL ? Number(tallaL) : 0,
        tallaXl: tallaXl ? Number(tallaXl) : 0,
        tallaXxl: tallaXxl ? Number(tallaXxl) : 0,
        cajaTallaM: cajaTallaM ? Number(cajaTallaM) : 0,
        cajaTallaL: cajaTallaL ? Number(cajaTallaL) : 0,
        cajaTallaXl: cajaTallaXl ? Number(cajaTallaXl) : 0,
        cajaTallaXxl: cajaTallaXxl ? Number(cajaTallaXxl) : 0,
        sueltaTallaM: sueltaTallaM ? Number(sueltaTallaM) : 0,
        sueltaTallaL: sueltaTallaL ? Number(sueltaTallaL) : 0,
        sueltaTallaXl: sueltaTallaXl ? Number(sueltaTallaXl) : 0,
        sueltaTallaXxl: sueltaTallaXxl ? Number(sueltaTallaXxl) : 0,
        riderId: riderElegido?.id ?? null,
        riderNombreLibre: riderElegido ? riderElegido.nombre : riderNombreLibre,
        notas: tipo?.clave === 'ENVIO_MENSAJERIA' && usaCorreos ? `[Correos] ${notas}`.trim() : notas,
      });
      if (res && 'error' in res) {
        setError(res.error);
        return;
      }
      onRegistrado();
    });
  }

  const PASOS: Paso[] = ['tipo', 'detalle', 'confirmar'];
  const indicePaso = PASOS.indexOf(paso);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCerrar}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Cabecera con indicador de pasos */}
        <div className="border-b border-border px-6 py-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-ink">{t('stock.nuevoMovimiento')}</h2>
            <button onClick={onCerrar} className="text-ink-muted hover:text-ink">
              <X size={18} />
            </button>
          </div>
          <div className="flex items-center gap-2">
            {PASOS.map((p, i) => (
              <div key={p} className="flex flex-1 items-center gap-2">
                <div
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition ${
                    i < indicePaso ? 'bg-primary text-white' : i === indicePaso ? 'bg-primary text-white ring-4 ring-primary/20' : 'bg-bg text-ink-muted'
                  }`}
                >
                  {i < indicePaso ? <Check size={12} /> : i + 1}
                </div>
                <span className={`text-xs font-medium ${i <= indicePaso ? 'text-ink' : 'text-ink-muted'}`}>
                  {p === 'tipo' ? t('stock.pasoTipo') : p === 'detalle' ? t('stock.pasoDetalle') : t('stock.pasoConfirmar')}
                </span>
                {i < PASOS.length - 1 && <div className={`h-px flex-1 ${i < indicePaso ? 'bg-primary' : 'bg-border'}`} />}
              </div>
            ))}
          </div>
        </div>

        <div className="p-6">
          {/* Paso 1: Material + Tipo */}
          {paso === 'tipo' && (
            <div className="flex flex-col gap-4">
              <div>
                <label className="mb-2 block text-xs font-semibold text-ink-muted">{t('stock.material')}</label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {materiales.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setMaterialId(m.id)}
                      className={`flex flex-col items-center gap-1 rounded-xl border-2 px-2 py-3 text-xs font-medium transition ${
                        materialId === m.id ? 'border-primary bg-primary/5 text-primary' : 'border-border text-ink-muted hover:border-primary/40'
                      }`}
                    >
                      <span className="text-xl">{m.icono}</span>
                      {nombreSegunIdioma(idioma, m.titulo, m.titulo_en)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold text-ink-muted">{t('stock.tipoMovimiento')}</label>
                <div className="flex flex-col gap-1.5">
                  {tipos.map((tp) => (
                    <button
                      key={tp.clave}
                      onClick={() => setTipoClave(tp.clave)}
                      className={`flex items-center justify-between rounded-xl border-2 px-3 py-2.5 text-left text-sm font-medium transition ${
                        tipoClave === tp.clave ? 'border-primary bg-primary/5 text-primary' : 'border-border text-ink hover:border-primary/40'
                      }`}
                    >
                      {nombreSegunIdioma(idioma, tp.etiqueta, tp.etiqueta_en)}
                      {tipoClave === tp.clave && <Check size={16} />}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Paso 2: Detalle (origen/destino, cantidades, rider) */}
          {paso === 'detalle' && tipo && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2 rounded-xl bg-bg px-3 py-2.5 text-sm">
                <Package size={16} className="text-primary" />
                <span className="font-medium text-ink">{nombreSegunIdioma(idioma, materialSeleccionado.titulo, materialSeleccionado.titulo_en)}</span>
                <ArrowRight size={12} className="text-ink-muted" />
                <span className="text-ink-muted">{nombreSegunIdioma(idioma, tipo.etiqueta, tipo.etiqueta_en)}</span>
              </div>

              {(tipo.requiere_origen || tipo.requiere_destino) && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {tipo.requiere_origen && (
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-ink-muted">{t('stock.centroOrigen')}</label>
                      <select value={centroOrigenId} onChange={(e) => setCentroOrigenId(e.target.value)} className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none">
                        <option value="">{t('stock.selecciona')}</option>
                        {centros.map((c) => (
                          <option key={c.id} value={c.id}>{c.nombre}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  {tipo.requiere_destino && (
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-ink-muted">{t('stock.centroDestino')}</label>
                      <select value={centroDestinoId} onChange={(e) => setCentroDestinoId(e.target.value)} className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none">
                        <option value="">{t('stock.selecciona')}</option>
                        {centros.map((c) => (
                          <option key={c.id} value={c.id}>{c.nombre}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}

              {tipo.clave === TIPO_NEUTRO_SIN_CANTIDAD ? (
                <div className="rounded-lg bg-bg px-3 py-2.5 text-xs text-ink-muted">{t('stock.notaTipoNeutro')}</div>
              ) : materialSeleccionado.tiene_tallas ? (
                modoCajas ? (
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-ink-muted">
                      {t('stock.cajas')} + {t('stock.sueltas')} <span className="font-normal opacity-70">({materialSeleccionado.uds_por_caja} {t('stock.udsPorCaja')})</span>
                    </label>
                    <div className="overflow-hidden rounded-lg border border-border">
                      <table className="w-full text-xs">
                        <thead className="bg-bg text-ink-muted">
                          <tr>
                            <th className="px-2 py-1.5 text-left font-semibold"></th>
                            <th className="px-2 py-1.5 font-semibold">M</th>
                            <th className="px-2 py-1.5 font-semibold">L</th>
                            <th className="px-2 py-1.5 font-semibold">XL</th>
                            <th className="px-2 py-1.5 font-semibold">XXL</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          <tr>
                            <td className="px-2 py-1.5 font-medium text-ink">{t('stock.cajas')}</td>
                            {[[cajaTallaM, setCajaTallaM], [cajaTallaL, setCajaTallaL], [cajaTallaXl, setCajaTallaXl], [cajaTallaXxl, setCajaTallaXxl]].map(([v, s], i) => (
                              <td key={i} className="px-1 py-1">
                                <input type="number" min={0} value={v as string} onChange={(e) => (s as (v: string) => void)(e.target.value)} className="w-full rounded border border-border px-1 py-1 text-center text-xs focus:border-primary focus:outline-none" />
                              </td>
                            ))}
                          </tr>
                          <tr>
                            <td className="px-2 py-1.5 font-medium text-ink">{t('stock.sueltas')}</td>
                            {[[sueltaTallaM, setSueltaTallaM], [sueltaTallaL, setSueltaTallaL], [sueltaTallaXl, setSueltaTallaXl], [sueltaTallaXxl, setSueltaTallaXxl]].map(([v, s], i) => (
                              <td key={i} className="px-1 py-1">
                                <input type="number" min={0} value={v as string} onChange={(e) => (s as (v: string) => void)(e.target.value)} className="w-full rounded border border-border px-1 py-1 text-center text-xs focus:border-primary focus:outline-none" />
                              </td>
                            ))}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-ink-muted">{t('stock.colTallas')}</label>
                    <div className="grid grid-cols-4 gap-2">
                      <input type="number" min={0} placeholder="M" value={tallaM} onChange={(e) => setTallaM(e.target.value)} className="rounded-lg border border-border px-2 py-2 text-center text-sm focus:border-primary focus:outline-none" />
                      <input type="number" min={0} placeholder="L" value={tallaL} onChange={(e) => setTallaL(e.target.value)} className="rounded-lg border border-border px-2 py-2 text-center text-sm focus:border-primary focus:outline-none" />
                      <input type="number" min={0} placeholder="XL" value={tallaXl} onChange={(e) => setTallaXl(e.target.value)} className="rounded-lg border border-border px-2 py-2 text-center text-sm focus:border-primary focus:outline-none" />
                      <input type="number" min={0} placeholder="XXL" value={tallaXxl} onChange={(e) => setTallaXxl(e.target.value)} className="rounded-lg border border-border px-2 py-2 text-center text-sm focus:border-primary focus:outline-none" />
                    </div>
                  </div>
                )
              ) : modoCajas ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-ink-muted">{t('stock.cajas')} <span className="font-normal opacity-70">({materialSeleccionado.uds_por_caja} {t('stock.udsPorCaja')})</span></label>
                    <input type="number" min={0} value={cajas} onChange={(e) => setCajas(e.target.value)} className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-ink-muted">{t('stock.sueltas')}</label>
                    <input type="number" min={0} value={sueltas} onChange={(e) => setSueltas(e.target.value)} className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none" />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink-muted">{t('stock.cantidad')}</label>
                  <input type="number" min={0} value={cantidad} onChange={(e) => setCantidad(e.target.value)} className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none" />
                </div>
              )}

              {totalUnidades > 0 && (
                <div className="rounded-lg bg-primary/5 px-3 py-2 text-sm font-medium text-primary">
                  {modoCajas && totalCajas > 0
                    ? `${totalCajas} ${t('stock.cajas').toLowerCase()} + ${totalSueltas} ${t('stock.sueltas').toLowerCase()} = `
                    : ''}
                  {totalUnidades} {t('stock.totalUnidades').toLowerCase()}
                </div>
              )}

              {mostrarRider && (
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink-muted">{t('stock.riderOpcional')}</label>
                  <BuscadorRiderRemoto requerido={false} onSeleccionar={alElegirRider} />
                  {!riderElegido && (
                    <input
                      value={riderNombreLibre}
                      onChange={(e) => setRiderNombreLibre(e.target.value)}
                      placeholder={t('stock.riderPlaceholderLibre')}
                      className="mt-1.5 w-full rounded-lg border border-border px-3 py-2 text-xs focus:border-primary focus:outline-none"
                    />
                  )}
                </div>
              )}

              {tipo.clave === 'ENVIO_MENSAJERIA' && (
                <label className="flex items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-sm text-ink">
                  <input type="checkbox" checked={usaCorreos} onChange={(e) => setUsaCorreos(e.target.checked)} className="h-4 w-4 accent-primary" />
                  {t('stock.usaCorreos')}
                </label>
              )}

              <div>
                <label className="mb-1 block text-xs font-semibold text-ink-muted">{t('stock.notas')}</label>
                <textarea value={notas} onChange={(e) => setNotas(e.target.value)} placeholder={t('stock.notasPlaceholder')} rows={2} className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none" />
              </div>
            </div>
          )}

          {/* Paso 3: Confirmar */}
          {paso === 'confirmar' && tipo && (
            <div className="flex flex-col gap-4">
              <div className="rounded-xl border border-border bg-bg p-4">
                <h3 className="mb-3 text-sm font-semibold text-ink">{t('stock.resumenMovimiento')}</h3>
                <dl className="flex flex-col gap-2 text-sm">
                  <div className="flex justify-between"><dt className="text-ink-muted">{t('stock.tipoMovimiento')}</dt><dd className="font-medium text-ink">{nombreSegunIdioma(idioma, tipo.etiqueta, tipo.etiqueta_en)}</dd></div>
                  <div className="flex justify-between"><dt className="text-ink-muted">{t('stock.material')}</dt><dd className="font-medium text-ink">{materialSeleccionado.icono} {nombreSegunIdioma(idioma, materialSeleccionado.titulo, materialSeleccionado.titulo_en)}</dd></div>
                  {centroOrigenId && <div className="flex justify-between"><dt className="text-ink-muted">{t('stock.centroOrigen')}</dt><dd className="font-medium text-ink">{nombreCentro(centroOrigenId)}</dd></div>}
                  {centroDestinoId && <div className="flex justify-between"><dt className="text-ink-muted">{t('stock.centroDestino')}</dt><dd className="font-medium text-ink">{nombreCentro(centroDestinoId)}</dd></div>}
                  {(riderElegido || riderNombreLibre) && <div className="flex justify-between"><dt className="text-ink-muted">{t('stock.riderOpcional')}</dt><dd className="font-medium text-ink">{riderElegido?.nombre ?? riderNombreLibre}</dd></div>}
                  <div className="flex justify-between border-t border-border pt-2"><dt className="font-semibold text-ink">{t('stock.totalUnidades')}</dt><dd className="font-mono text-lg font-bold text-primary">{totalUnidades}</dd></div>
                </dl>
              </div>
              {error && <p className="text-sm font-medium text-danger">{error}</p>}
            </div>
          )}
        </div>

        {/* Navegación */}
        <div className="flex items-center justify-between border-t border-border px-6 py-4">
          <button
            onClick={() => (paso === 'tipo' ? onCerrar() : setPaso(PASOS[indicePaso - 1]))}
            className="flex items-center gap-1 rounded-full border border-border px-4 py-2 text-sm font-medium text-ink-muted hover:bg-bg"
          >
            <ChevronLeft size={14} />
            {paso === 'tipo' ? t('stock.cancelar') : t('stock.atras')}
          </button>

          {paso === 'tipo' && (
            <button
              onClick={() => setPaso('detalle')}
              disabled={!tipoClave}
              className="flex items-center gap-1 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              {t('stock.pasoDetalle')}
              <ArrowRight size={14} />
            </button>
          )}
          {paso === 'detalle' && (
            <button
              onClick={() => setPaso('confirmar')}
              disabled={!puedeAvanzarDeDetalle()}
              className="flex items-center gap-1 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              {t('stock.pasoConfirmar')}
              <ArrowRight size={14} />
            </button>
          )}
          {paso === 'confirmar' && (
            <button onClick={guardar} disabled={pending} className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white disabled:opacity-60">
              {pending ? t('stock.guardando') : t('stock.registrar')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
