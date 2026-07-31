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

type PhotonFeature = {
  geometry?: {
    coordinates?: unknown;
  };
  properties?: {
    name?: unknown;
    housenumber?: unknown;
    street?: unknown;
    district?: unknown;
    city?: unknown;
    county?: unknown;
    state?: unknown;
    postcode?: unknown;
    country?: unknown;
    osm_key?: unknown;
    osm_value?: unknown;
    osm_type?: unknown;
    osm_id?: unknown;
  };
};

type PhotonResponse = {
  features?: unknown;
};

export function normalizeMapSearchQuery(value: unknown): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, 160);
}

export function broadenMapSearchQuery(value: unknown): string {
  return normalizeMapSearchQuery(value)
    .replace(/\b\d+[a-z]?\b/giu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeMapCoordinate(
  value: unknown,
  minimum: number,
  maximum: number,
): number | null {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const coordinate = Number(value);
  return Number.isFinite(coordinate) && coordinate >= minimum && coordinate <= maximum
    ? coordinate
    : null;
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

export function mapPhotonResults(value: unknown): MapSearchLocation[] {
  if (!isRecord(value)) return [];
  const response = value as PhotonResponse;
  if (!Array.isArray(response.features)) return [];

  const seen = new Set<string>();
  const locations: MapSearchLocation[] = [];
  for (const raw of response.features.slice(0, 10)) {
    if (!isRecord(raw)) continue;
    const feature = raw as PhotonFeature;
    const properties = feature.properties;
    const coordinates = feature.geometry?.coordinates;
    if (!properties || !Array.isArray(coordinates) || coordinates.length < 2) continue;

    const longitude = Number(coordinates[0]);
    const latitude = Number(coordinates[1]);
    const address = formatPhotonAddress(properties);
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

    const osmType = stringField(properties.osm_type);
    const osmId = stringField(properties.osm_id);
    locations.push({
      id: osmType && osmId ? `${osmType.toLocaleLowerCase()}-${osmId}` : coordinateKey,
      address,
      latitude,
      longitude,
      category: stringField(properties.osm_key),
      type: stringField(properties.osm_value),
    });

    if (locations.length >= 5) break;
  }

  return locations;
}

function formatPhotonAddress(properties: NonNullable<PhotonFeature['properties']>): string {
  const name = stringField(properties.name);
  const street = stringField(properties.street);
  const houseNumber = stringField(properties.housenumber);
  const streetAddress = [street, houseNumber].filter(Boolean).join(' ');
  const parts = [
    name,
    streetAddress,
    stringField(properties.district),
    stringField(properties.city),
    stringField(properties.county),
    stringField(properties.state),
    stringField(properties.postcode),
    stringField(properties.country),
  ];

  const seen = new Set<string>();
  return parts
    .filter((part) => {
      if (!part) return false;
      const key = part.toLocaleLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(', ')
    .slice(0, 240);
}

function stringField(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value).trim().slice(0, 80)
    : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
