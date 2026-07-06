'use client';

import { useState } from 'react';

export function Tabs({
  incidenciaPanel,
  ausenciaPanel,
}: {
  incidenciaPanel: React.ReactNode;
  ausenciaPanel: React.ReactNode;
}) {
  const [tab, setTab] = useState<'incidencia' | 'ausencia'>('incidencia');

  return (
    <div>
      <div className="mb-5 flex gap-1 rounded-full bg-bg p-1">
        <button
          onClick={() => setTab('incidencia')}
          className={`flex-1 rounded-full py-2.5 text-sm font-semibold transition ${
            tab === 'incidencia' ? 'bg-primary text-white' : 'text-ink-muted'
          }`}
        >
          Reportar incidencia
        </button>
        <button
          onClick={() => setTab('ausencia')}
          className={`flex-1 rounded-full py-2.5 text-sm font-semibold transition ${
            tab === 'ausencia' ? 'bg-primary text-white' : 'text-ink-muted'
          }`}
        >
          Comunicar ausencia
        </button>
      </div>
      {tab === 'incidencia' ? incidenciaPanel : ausenciaPanel}
    </div>
  );
}
