// Helpers puros de geolocalización. Sin dependencias de Leaflet ni DOM, para
// que toda la lógica de valor (validación de coordenadas y construcción de
// enlaces de navegación) sea testeable sin montar un mapa.

export function isValidLatLng(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

export function formatCoords(lat: number, lng: number): string {
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

// Destino de navegación principal: Google Maps "directions" universal link.
// Funciona en Android, iOS y escritorio y deja que el usuario elija el modo.
export function buildDirectionsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

// Alternativa secundaria para quien usa Waze.
export function buildWazeUrl(lat: number, lng: number): string {
  return `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
}

// Normaliza la respuesta del navegador (`navigator.geolocation`) a la forma
// `{lat,lng}` que usa el resto de la app. Tipado mínimo estructural para no
// depender del lib DOM en los tests.
export function coordsFromPosition(pos: {
  coords: { latitude: number; longitude: number };
}): { lat: number; lng: number } {
  return { lat: pos.coords.latitude, lng: pos.coords.longitude };
}
