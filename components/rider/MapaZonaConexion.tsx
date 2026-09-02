'use client';

import { useMemo } from 'react';
import { MapContainer, TileLayer, Polygon } from 'react-leaflet';
import type { LatLngExpression } from 'leaflet';
import 'leaflet/dist/leaflet.css';

/**
 * Mapa real (no imagen) con el/los polígono(s) de la zona resaltados
 * — sustituye a la imagen estática subida a mano del sistema
 * anterior. Los polígonos vienen ya calculados desde
 * sincronizarZonasConexion() (lib/zonasConexion.ts), extraídos
 * semanalmente del mapa oficial en Drive.
 */
export function MapaZonaConexion({ poligonos }: { poligonos: [number, number][][] }) {
  const bounds = useMemo<[number, number][]>(() => poligonos.flat(), [poligonos]);

  return (
    <div className="h-72 w-full overflow-hidden rounded-xl border border-border">
      <MapContainer bounds={bounds} boundsOptions={{ padding: [20, 20] }} scrollWheelZoom={false} className="h-full w-full">
        <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {poligonos.map((puntos, i) => (
          <Polygon key={i} positions={puntos as LatLngExpression[]} pathOptions={{ color: '#0d6b6b', fillColor: '#0d6b6b', fillOpacity: 0.18, weight: 3 }} />
        ))}
      </MapContainer>
    </div>
  );
}
