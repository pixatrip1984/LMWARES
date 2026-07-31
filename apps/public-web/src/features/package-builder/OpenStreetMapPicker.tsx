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
  const lastSearchAtRef = useRef(0);
  const suggestionRequestRef = useRef(0);
  const reverseRequestRef = useRef(0);
  const suppressSuggestionsRef = useRef(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MapSearchLocation[]>([]);
  const [searching, setSearching] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [resolvingPoint, setResolvingPoint] = useState(false);
  const [searchMessage, setSearchMessage] = useState('');

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  const resolveMapPoint = async (rawLatitude: number, rawLongitude: number) => {
    const nextLatitude = roundCoordinate(rawLatitude);
    const nextLongitude = roundCoordinate(rawLongitude);
    const requestId = ++reverseRequestRef.current;
    suggestionRequestRef.current += 1;
    setResults([]);
    setResolvingPoint(true);
    setSearchMessage('Buscando la dirección del punto seleccionado…');
    onSelectRef.current({
      address: '',
      latitude: nextLatitude,
      longitude: nextLongitude,
    });

    try {
      const response = await api.reverseMapLocation(nextLatitude, nextLongitude);
      if (requestId !== reverseRequestRef.current) return;
      const resolvedAddress = response.result?.address
        || `Punto seleccionado en el mapa (${nextLatitude.toFixed(6)}, ${nextLongitude.toFixed(6)})`;
      suppressSuggestionsRef.current = true;
      setQuery(resolvedAddress);
      onSelectRef.current({
        address: resolvedAddress,
        latitude: nextLatitude,
        longitude: nextLongitude,
      });
      setSearchMessage(
        response.result
          ? 'Dirección localizada. Arrastra el pin o haz clic en otro punto para afinarla.'
          : 'No hay una dirección registrada en OpenStreetMap para ese punto. Puedes editar el texto de abajo.',
      );
    } catch (error) {
      if (requestId !== reverseRequestRef.current) return;
      const fallbackAddress = `Punto seleccionado en el mapa (${nextLatitude.toFixed(6)}, ${nextLongitude.toFixed(6)})`;
      suppressSuggestionsRef.current = true;
      setQuery(fallbackAddress);
      onSelectRef.current({
        address: fallbackAddress,
        latitude: nextLatitude,
        longitude: nextLongitude,
      });
      setSearchMessage(
        error instanceof Error
          ? `${error.message} Puedes editar manualmente la dirección de abajo.`
          : 'No pudimos localizar la dirección. Puedes editar manualmente el texto de abajo.',
      );
    } finally {
      if (requestId === reverseRequestRef.current) setResolvingPoint(false);
    }
  };

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
      void resolveMapPoint(latlng.lat, latlng.lng);
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
        draggable: true,
        icon: LOCATION_MARKER,
        keyboard: true,
        title: 'Ubicación seleccionada',
      }).addTo(map);
      markerRef.current.on('dragend', () => {
        const markerPosition = markerRef.current?.getLatLng();
        if (markerPosition) void resolveMapPoint(markerPosition.lat, markerPosition.lng);
      });
    }
    map.setView(position, Math.max(map.getZoom(), 16), { animate: true });
  }, [latitude, longitude]);

  useEffect(() => {
    const normalized = query.trim().replace(/\s+/g, ' ');
    const requestId = ++suggestionRequestRef.current;
    if (suppressSuggestionsRef.current) {
      suppressSuggestionsRef.current = false;
      return;
    }
    if (normalized.length < 3) {
      setResults([]);
      setSuggesting(false);
      return;
    }

    const timeout = window.setTimeout(async () => {
      if (requestId !== suggestionRequestRef.current) return;
      setSuggesting(true);
      setSearchMessage('Buscando sugerencias de ubicación…');
      const center = mapRef.current?.getCenter();
      try {
        const response = await api.suggestMapLocations(
          normalized,
          center ? { latitude: center.lat, longitude: center.lng } : undefined,
        );
        if (requestId !== suggestionRequestRef.current) return;
        setResults(response.results);
        setSearchMessage(
          response.results.length > 0
            ? response.approximate
              ? 'No aparece el número exacto en OpenStreetMap; mostramos coincidencias cercanas para que puedas ubicar la zona.'
              : 'Selecciona una sugerencia; el mapa se moverá automáticamente.'
            : 'Aún no hay coincidencias. Agrega ciudad o estado, o selecciona el punto directamente en el mapa.',
        );
      } catch (error) {
        if (requestId !== suggestionRequestRef.current) return;
        setResults([]);
        setSearchMessage(error instanceof Error ? error.message : 'No fue posible cargar sugerencias.');
      } finally {
        if (requestId === suggestionRequestRef.current) setSuggesting(false);
      }
    }, 700);

    return () => window.clearTimeout(timeout);
  }, [query]);

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
    suggestionRequestRef.current += 1;
    setSuggesting(false);
    setSearching(true);
    setSearchMessage('Buscando en OpenStreetMap…');
    setResults([]);
    try {
      const response = await api.searchMapLocations(normalized);
      if (response.results.length > 0) {
        setResults(response.results);
        setSearchMessage('Selecciona una coincidencia para colocar el marcador.');
      } else {
        const center = mapRef.current?.getCenter();
        const fallback = await api.suggestMapLocations(
          normalized,
          center ? { latitude: center.lat, longitude: center.lng } : undefined,
        );
        setResults(fallback.results);
        setSearchMessage(
          fallback.results.length > 0
            ? 'No encontramos el número exacto; selecciona una coincidencia cercana y afina el punto en el mapa.'
            : 'No encontramos coincidencias. Agrega ciudad o estado, o selecciona directamente la zona en el mapa.',
        );
      }
    } catch (error) {
      setSearchMessage(error instanceof Error ? error.message : 'No fue posible buscar esa ubicación.');
    } finally {
      setSearching(false);
    }
  };

  const chooseResult = (result: MapSearchLocation) => {
    suggestionRequestRef.current += 1;
    reverseRequestRef.current += 1;
    suppressSuggestionsRef.current = true;
    setQuery(result.address);
    setResults([]);
    setSearchMessage('Ubicación seleccionada. Puedes afinarla haciendo clic en el mapa o arrastrando el pin.');
    onSelect({
      address: result.address,
      latitude: result.latitude,
      longitude: result.longitude,
    });
  };

  const clearSelection = () => {
    suggestionRequestRef.current += 1;
    reverseRequestRef.current += 1;
    if (markerRef.current && mapRef.current) {
      mapRef.current.removeLayer(markerRef.current);
      markerRef.current = null;
      mapRef.current.setView(MEXICO_CENTER, 5);
    }
    setQuery('');
    setResults([]);
    setResolvingPoint(false);
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
            aria-expanded={results.length > 0}
            aria-controls="lmw-map-search-results"
            aria-autocomplete="list"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ej. Museo MARCO, Monterrey o calle, número y ciudad"
            type="search"
            value={query}
          />
        </label>
        <button disabled={searching || resolvingPoint} type="submit">
          {searching ? 'Buscando…' : 'Buscar en el mapa'}
        </button>
      </form>

      <p className="lmw-map-picker__help" id="lmw-map-search-help">
        Las sugerencias aparecen al pausar mientras escribes. También puedes hacer clic en el mapa o arrastrar el pin para elegir la casa exacta.
      </p>

      {results.length > 0 ? (
        <div className="lmw-map-picker__results" id="lmw-map-search-results" role="listbox" aria-label="Resultados de ubicación">
          {results.map((result) => (
            <button
              key={result.id}
              aria-selected="false"
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
        {searchMessage
          || (suggesting ? 'Buscando sugerencias…' : '')
          || status
          || 'El mapa está listo para buscar o seleccionar un punto.'}
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
