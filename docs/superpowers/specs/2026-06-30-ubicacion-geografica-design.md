# Diseño — Ubicación geográfica de solicitudes (Fase 1)

- **Fecha:** 2026-06-30
- **Estado:** Aprobado (diseño), pendiente de plan de implementación
- **Rama:** `feat/ubicacion-geografica`
- **Entrega:** Pull Request a `main` (sin integración directa)

## 1. Contexto y objetivo

MedVene es mobile-first para conexiones 3G/LTE inestables; por diseño no usa
imágenes y carga solo fuentes de sistema para ahorrar datos. Sobre esa base
queremos permitir que una solicitud lleve un **punto geográfico exacto**
(latitud/longitud) para que el donante obtenga **rutas más claras** al punto
de entrega.

El objetivo del usuario abarca tres capacidades: (a) navegación del donante,
(b) un mapa del feed con todas las solicitudes, y (c) un punto de entrega que
puede no ser el hospital. Para mantener PRs pequeños y revisables, el trabajo
se divide en fases. **Este spec cubre solo la Fase 1.**

### Fases
- **Fase 1 (este spec):** cimiento de datos + captura opcional en el form +
  navegación "Cómo llegar" en el detalle.
- **Fase 2 (spec futuro):** mapa del feed (toggle "Ver mapa" con marcadores).
- **Fase 3 (opcional):** refinamientos (auto-centrar por estado, clustering).

## 2. Decisiones de diseño (cerradas)

| Tema | Decisión |
|------|----------|
| Obligatoriedad | **Opcional**. No marcar ubicación es válido; no bloquea el envío. |
| Estrategia de datos | **Mapa bajo demanda (lazy)**. El flujo por defecto sigue siendo texto; Leaflet/OSM solo cargan ante acción del usuario. |
| Captura | **GPS ("Usar mi ubicación") + tocar en el mapa.** Sin pegado de enlaces en esta fase. |
| Navegación | **Handoff** a la app de mapas externa; sin motor de ruteo embebido. Destino principal: **Google Maps**; secundario opcional: Waze. |
| Mini-mapa en detalle | **Colapsado por defecto** (se expande al tocar "Ver mapa"), para proteger datos. |
| Proveedor de tiles | OpenStreetMap estándar con atribución. (Nota operativa: a escala de producción puede requerir proveedor propio por la política de uso de OSM.) |

## 3. Modelo de datos (migración 0002)

Agregar a la tabla `solicitudes` dos columnas **nullable**:

- `latitud` — `double`, nullable.
- `longitud` — `double`, nullable.

Se elige `double` (no `decimal`) porque Drizzle/mysql2 lo devuelve como número
JS directo (sin parseo), con precisión más que suficiente para coordenadas.

### Exposición
Ambas columnas se agregan al DTO público:
- `PublicSolicitud` (tipo en `db/schema.ts`).
- `publicSolicitudSelect` (proyección en `api/solicitudes-router.ts`).

No son sensibles (a diferencia de los PIN): el donante las necesita para
navegar y la Fase 2 las consumirá para el mapa del feed.

### Migración y schema-contract
- Generar con `drizzle-kit generate` → `db/migrations/0002_*.sql` (+ snapshot meta).
- **Re-baseline obligatorio** del schema-contract (`npm run db:baseline`) porque
  `release:verify` corre `db:verify`. Sin esto, el pipeline de release fallaría.
- Las solicitudes existentes quedan con `latitud/longitud = NULL` (degradación limpia).

## 4. Backend (tRPC)

### `solicitudes.create`
- Input suma `latitud?` y `longitud?` como `z.number()` con rango válido:
  - `latitud` ∈ [−90, 90], `longitud` ∈ [−180, 180].
  - Regla a nivel de objeto (`.refine`): **ambas presentes o ambas ausentes**
    (no se acepta una sola).
- Los valores fluyen al insert existente, que ya hace `...input` sobre
  `createSolicitud`. Se extiende `CreateSolicitudInput` con los dos campos.

### Lectura
- `getById` y `list` ya proyectan vía `publicSolicitudSelect`; al añadir las
  columnas ahí quedan disponibles en el detalle (Fase 1) y en el feed (Fase 2).

## 5. Captura en el formulario (`NuevaSolicitud.tsx`)

Bloque nuevo **"Ubicación exacta (opcional)"** dentro de la sección "Ubicación
y Contacto", debajo del selector de Municipio:

- Botón **"📍 Usar mi ubicación"** → `navigator.geolocation.getCurrentPosition`.
  En éxito: guarda `latitud/longitud` en el estado del form y muestra
  "Ubicación marcada ✓" con las coordenadas y un botón "quitar". En error
  (permiso denegado / sin señal): mensaje claro y la opción de usar el mapa.
- Botón **"Marcar en el mapa"** → carga **lazy** `<UbicacionPicker>` (Leaflet).
  El usuario toca el mapa para fijar el pin y confirma; el componente devuelve
  `{ lat, lng }` al form.
- Estado del form: `latitud?: number | null`, `longitud?: number | null`.
  No participa de la validación de envío (es opcional).

## 6. Navegación / detalle (`DetalleSolicitud.tsx`)

Cuando la solicitud tiene coordenadas:
- Botón **"Cómo llegar"** → abre
  `https://www.google.com/maps/dir/?api=1&destination=LAT,LNG`
  (funciona en Android/iOS/escritorio). Secundario opcional Waze:
  `https://waze.com/ul?ll=LAT,LNG&navigate=yes`.
- **Mini-mapa lazy colapsado** ("Ver mapa"): muestra el pin solo al expandir.
- El mensaje de WhatsApp incluye el enlace de mapas con coords.

Cuando no tiene coordenadas: no se renderiza nada extra.

## 7. Dependencias y bundle

- Nueva dependencia: `leaflet`; dev: `@types/leaflet`.
- **Todo el uso de Leaflet detrás de `import()` dinámico** (`React.lazy` +
  `<Suspense>`), de modo que quede en un chunk separado de Vite y **fuera del
  bundle inicial**. El CSS de Leaflet se importa dentro de ese chunk.
- Esto es lo que sostiene la promesa de 3G: quien no abre un mapa no descarga
  ni Leaflet ni tiles.

## 8. Unidades y límites

| Unidad | Qué hace | Depende de |
|--------|----------|------------|
| `src/lib/geo.ts` | Helpers puros: `buildDirectionsUrl`, `buildWazeUrl`, `formatCoords`, `isValidLatLng`. | nada (pura) |
| `<UbicacionPicker>` | Mapa lazy para fijar un pin; devuelve `{lat,lng}`. | Leaflet (lazy), `geo.ts` |
| `<UbicacionDetalle>` | Botón "Cómo llegar" + mini-mapa lazy en el detalle. | Leaflet (lazy), `geo.ts` |
| Esquema/DTO | Columnas + proyección pública. | Drizzle |
| `solicitudes.create` | Validación e inserción de coords. | `geo`/zod, `createSolicitud` |

El glue de Leaflet/DOM se mantiene fino; la lógica de valor vive en `geo.ts`
y en los handlers de geolocalización (funciones extraíbles), que sí se testean.

## 9. Testing

- **Unitarios:**
  - Input zod de `create`: acepta coords válidas, rechaza fuera de rango y
    rechaza "una sola" coordenada (regla ambas-o-ninguna).
  - `geo.ts`: `buildDirectionsUrl`/`buildWazeUrl` arman la URL esperada;
    `isValidLatLng` y `formatCoords` en casos límite.
  - DTO/insert: el `publicSolicitudSelect` incluye lat/lng; `createSolicitud`
    persiste las coords cuando vienen y deja NULL cuando no.
- **No** se testea con unidad el render de Leaflet (glue DOM). La lógica de los
  handlers de geolocalización se extrae a funciones puras para poder testearla.

## 10. Fuera de alcance (Fase 1)

- Mapa del feed con todas las solicitudes (Fase 2).
- Resolución de enlaces cortos de Google Maps (`maps.app.goo.gl`).
- Búsqueda por dirección / geocoding.
- Auto-centrado del mapa según el estado/municipio elegido.

## 11. Entrega

- Rama `feat/ubicacion-geografica` desde `main`.
- **Pull Request a `main`** al completar e includir verificación
  (`npm run check`, `lint`, `test`, build). Sin merge/integración directa.
