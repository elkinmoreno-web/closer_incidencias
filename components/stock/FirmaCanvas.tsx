'use client';

import { useEffect, useRef, useState } from 'react';
import { Eraser } from 'lucide-react';
import { useIdioma } from '@/components/i18n/IdiomaProvider';

/**
 * Lienzo de firma, equivalente al que capturaba la firma en el panel
 * de Sheets (dataUrl en base64 con "base64," como separador — mismo
 * formato que espera _pltInsertarFirma allá, y crearFichaEntrega aquí).
 * Funciona con ratón y con toque (móvil/tablet).
 */
export function FirmaCanvas({ onCambio }: { onCambio: (dataUrl: string | null) => void }) {
  const { t } = useIdioma();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dibujandoRef = useRef(false);
  const [tieneTrazo, setTieneTrazo] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Se dimensiona con devicePixelRatio para que la firma no salga
    // borrosa en pantallas de alta densidad (móviles, sobre todo).
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(dpr, dpr);
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#1a1a1a';
    }
  }, []);

  function posicionRelativa(e: React.MouseEvent | React.TouchEvent): { x: number; y: number } {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const punto = 'touches' in e ? e.touches[0] : e;
    return { x: punto.clientX - rect.left, y: punto.clientY - rect.top };
  }

  function empezar(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    dibujandoRef.current = true;
    const { x, y } = posicionRelativa(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function mover(e: React.MouseEvent | React.TouchEvent) {
    if (!dibujandoRef.current) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = posicionRelativa(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    if (!tieneTrazo) setTieneTrazo(true);
  }

  function terminar() {
    if (!dibujandoRef.current) return;
    dibujandoRef.current = false;
    emitirCambio();
  }

  function emitirCambio() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onCambio(tieneTrazo || dibujandoRef.current ? canvas.toDataURL('image/png') : null);
  }

  function limpiar() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setTieneTrazo(false);
    onCambio(null);
  }

  return (
    <div>
      <div className="relative overflow-hidden rounded-lg border border-border bg-white">
        <canvas
          ref={canvasRef}
          className="h-32 w-full touch-none"
          onMouseDown={empezar}
          onMouseMove={mover}
          onMouseUp={terminar}
          onMouseLeave={terminar}
          onTouchStart={empezar}
          onTouchMove={mover}
          onTouchEnd={terminar}
        />
        {!tieneTrazo && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-ink-muted opacity-60">
            {t('stockFirma.placeholder')}
          </span>
        )}
      </div>
      <button type="button" onClick={limpiar} className="mt-1.5 flex items-center gap-1 text-xs text-ink-muted hover:text-primary">
        <Eraser size={12} />
        {t('stockFirma.limpiar')}
      </button>
    </div>
  );
}
