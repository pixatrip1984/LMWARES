import type { MapSearchLocation } from '@starter/api-client';
import L, { type LeafletMouseEvent, type Map as LeafletMap, type Marker } from 'leaflet';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api } from '../../lib/api';
import 'leaflet/dist/leaflet.css';
import './openStreetMapPicker.css';

type LocationSelection = {
  address: string;
  latitude: number;
  longitude: number;
};

type OpenStreetMapPickerProps = {
  address: string;
  latitude: number | null;
  longitude: number | null;
  status?: string;
  onAddressChange: (address: string) => void;
  onClear: () => void;
  onSelect: (selection: LocationSelection) => void;
};

const MEXICO_CENTER: L.LatLngExpression = [23.6345, -102.5528];
const LOCATION_MARKER = L.divIcon({
  className: 'lmw-map-picker__marker',
  html: '<span aria-hidden="true"></span>',
  iconAnchor: [17, 38],
  iconSize: [34, 38],
});

export function OpenStreetMapPicker({
  address,
  latitude,
  longitude,
  status,
  onAddressChange,
  onClear,
  onSelect,
}: OpenStreetMapPickerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const onSelectRef = useRef(onSelect);
  const addressRef = useRef(address);
  const lastSearchAtRef = useRef(0);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MapSearchLocation[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchMessage, setSearchMessage] = useState('');

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    addressRef.current = address;
  }, [address]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;

    const initialSelection = coordinatePair(latitude, longitude);
    const center: L.LatLngExpression = initialSelection ?? MEXICO_CENTER;
    const map = L.map(container, {
      attributionControl: true,
      scrollWheelZoom: false,
      zoomControl: true,
    }).setView(center, initialSelection ? 16 : 5);

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    const handleMapClick = ({ latlng }: LeafletMouseEvent) => {
      const nextLatitude = roundCoordinate(latlng.lat);
      const nextLongitude = roundCoordinate(latlng.lng);
      onSelectRef.current({
        address: addressRef.current,
        latitude: nextLatitude,
        longitude: nextLongitude,
      });
      setSearchMessage(
        addressRef.current.trim()
          ? 'Punto actualizado. Confirma debajo la dirección que se publicará.'
          : 'Punto marcado. Escribe debajo la dirección que se publicará.',
      );
    };

    map.on('click', handleMapClick);
    mapRef.current = map;
    window.setTimeout(() => map.invalidateSize(), 0);

    return () => {
      map.off('click', handleMapClick);
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const selection = coordinatePair(latitude, longitude);
    if (!map || !selection) return;
    const position = L.latLng(selection[0], selection[1]);
    if (markerRef.current) {
      markerRef.current.setLatLng(position);
    } else {
      markerRef.current = L.marker(position, {
        alt: 'Ubicación seleccionada',
        icon: LOCATION_MARKER,
        keyboard: true,
        title: 'Ubicación seleccionada',
      }).addTo(map);
    }
    map.setView(position, Math.max(map.getZoom(), 16), { animate: true });
  }, [latitude, longitude]);

  const search = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = query.trim().replace(/\s+/g, ' ');
    if (normalized.length < 3) {
      setSearchMessage('Escribe al menos tres caracteres: negocio, calle, colonia o ciudad.');
      return;
    }
    if (Date.now() - lastSearchAtRef.current < 1_100) {
      setSearchMessage('Espera un segundo antes de realizar otra búsqueda.');
      return;
    }

    lastSearchAtRef.current = Date.now();
    setSearching(true);
    setSearchMessage('Buscando en OpenStreetMap…');
    setResults([]);
    try {
      const response = await api.searchMapLocations(normalized);
      setResults(response.results);
      setSearchMessage(
        response.results.length > 0
          ? 'Selecciona una coincidencia para colocar el marcador.'
          : 'No encontramos coincidencias. Prueba agregando ciudad, estado o código postal.',
      );
    } catch (error) {
      setSearchMessage(error instanceof Error ? error.message : 'No fue posible buscar esa ubicación.');
    } finally {
      setSearching(false);
    }
  };

  const chooseResult = (result: MapSearchLocation) => {
    setQuery(result.address);
    setResults([]);
    setSearchMessage('Ubicación seleccionada. Puedes afinarla haciendo clic en el mapa.');
    onSelect({
      address: result.address,
      latitude: result.latitude,
      longitude: result.longitude,
    });
  };

  const clearSelection = () => {
    if (markerRef.current && mapRef.current) {
      mapRef.current.removeLayer(markerRef.current);
      markerRef.current = null;
      mapRef.current.setView(MEXICO_CENTER, 5);
    }
    setQuery('');
    setResults([]);
    setSearchMessage('Ubicación eliminada.');
    onClear();
  };

  const selectedCoordinates = coordinatePair(latitude, longitude);

  return (
    <div className="lmw-map-picker">
      <form className="lmw-map-picker__search" onSubmit={search}>
        <label>
          <span>Buscar negocio o dirección</span>
          <input
            aria-describedby="lmw-map-search-help"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ej. Museo MARCO, Monterrey o calle, número y ciudad"
            type="search"
            value={query}
          />
        </label>
        <button disabled={searching} type="submit">
          {searching ? 'Buscando…' : 'Buscar en el mapa'}
        </button>
      </form>

      <p className="lmw-map-picker__help" id="lmw-map-search-help">
        La consulta se envía únicamente al pulsar Buscar. Selecciona un resultado o haz clic directamente sobre el mapa.
      </p>

      {results.length > 0 ? (
        <div className="lmw-map-picker__results" role="listbox" aria-label="Resultados de ubicación">
          {results.map((result) => (
            <button
              key={result.id}
              onClick={() => chooseResult(result)}
              role="option"
              type="button"
            >
              <b>{result.address}</b>
              <span>{formatResultType(result)}</span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="lmw-map-picker__canvas" ref={containerRef} />

      <div className="lmw-map-picker__selection">
        <label>
          <span>Dirección que aparecerá publicada</span>
          <input
            maxLength={240}
            onChange={(event) => onAddressChange(event.target.value)}
            placeholder="Selecciona un resultado; puedes ajustar aquí el texto público"
            type="text"
            value={address}
          />
        </label>
        <div>
          <b>{selectedCoordinates ? 'Punto guardado' : 'Sin punto seleccionado'}</b>
          <small>
            {selectedCoordinates
              ? `${selectedCoordinates[0].toFixed(6)}, ${selectedCoordinates[1].toFixed(6)}`
              : 'Busca una ubicación o haz clic en el mapa.'}
          </small>
          {selectedCoordinates ? <button onClick={clearSelection} type="button">Quitar ubicación</button> : null}
        </div>
      </div>

      <p className="lmw-map-picker__status" role="status" aria-live="polite">
        {searchMessage || status || 'El mapa está listo para buscar o seleccionar un punto.'}
      </p>
    </div>
  );
}

export default OpenStreetMapPicker;

function coordinatePair(
  latitude: number | null,
  longitude: number | null,
): [number, number] | null {
  const valid = (
    typeof latitude === 'number'
    && Number.isFinite(latitude)
    && latitude >= -90
    && latitude <= 90
    && typeof longitude === 'number'
    && Number.isFinite(longitude)
    && longitude >= -180
    && longitude <= 180
  );
  return valid ? [latitude, longitude] : null;
}

function roundCoordinate(value: number): number {
  return Number(value.toFixed(6));
}

function formatResultType(result: MapSearchLocation): string {
  const value = [result.category, result.type].filter(Boolean).join(' · ');
  return value || 'Ubicación de OpenStreetMap';
}
