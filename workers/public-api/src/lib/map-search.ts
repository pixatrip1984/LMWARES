export interface MapSearchLocation {
  id: string;
  address: string;
  latitude: number;
  longitude: number;
  category: string;
  type: string;
}

type NominatimResult = {
  place_id?: unknown;
  osm_type?: unknown;
  osm_id?: unknown;
  display_name?: unknown;
  lat?: unknown;
  lon?: unknown;
  category?: unknown;
  type?: unknown;
};

export function normalizeMapSearchQuery(value: unknown): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, 160);
}

export function mapNominatimResults(value: unknown): MapSearchLocation[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const locations: MapSearchLocation[] = [];
  for (const raw of value.slice(0, 10)) {
    const item = raw as NominatimResult;
    const address = typeof item.display_name === 'string'
      ? item.display_name.trim().slice(0, 240)
      : '';
    const latitude = Number(item.lat);
    const longitude = Number(item.lon);
    if (
      address.length < 3
      || !Number.isFinite(latitude)
      || latitude < -90
      || latitude > 90
      || !Number.isFinite(longitude)
      || longitude < -180
      || longitude > 180
    ) {
      continue;
    }

    const coordinateKey = `${latitude.toFixed(6)},${longitude.toFixed(6)}`;
    if (seen.has(coordinateKey)) continue;
    seen.add(coordinateKey);

    const osmType = stringField(item.osm_type);
    const osmId = stringField(item.osm_id);
    const placeId = stringField(item.place_id);
    locations.push({
      id: osmType && osmId ? `${osmType}-${osmId}` : placeId || coordinateKey,
      address,
      latitude,
      longitude,
      category: stringField(item.category),
      type: stringField(item.type),
    });

    if (locations.length >= 5) break;
  }

  return locations;
}

function stringField(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value).trim().slice(0, 80)
    : '';
}
