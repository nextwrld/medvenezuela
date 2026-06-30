# Ubicación geográfica de solicitudes (Fase 1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que una solicitud lleve coordenadas (lat/lng) opcionales, capturadas por GPS o tocando un mapa lazy, y ofrecer en el detalle un botón "Cómo llegar" que abre la app de mapas del donante.

**Architecture:** Columnas `latitud`/`longitud` nullable en `solicitudes`; validación e inserción en el backend tRPC existente; captura y navegación en el frontend con todo el código de mapa (Leaflet+OSM) detrás de `import()` dinámico para no tocar el bundle inicial. Helpers de URL/validación viven en un módulo puro y testeado.

**Tech Stack:** TypeScript, Drizzle ORM (MySQL), tRPC v11, Zod v4, React 19, Vitest, Leaflet + OpenStreetMap.

**Spec:** `docs/superpowers/specs/2026-06-30-ubicacion-geografica-design.md`

**Rama:** `feat/ubicacion-geografica` (ya creada desde `main`). Entrega: **PR a `main`**, sin integración directa.

---

## File Structure

| Archivo | Responsabilidad | Acción |
|---------|-----------------|--------|
| `app/src/lib/geo.ts` | Helpers puros: validación de coords, formateo, URLs de navegación, parseo de `GeolocationPosition`. | Crear |
| `app/src/lib/geo.test.ts` | Tests unitarios de `geo.ts`. | Crear |
| `app/db/schema.ts` | Columnas `latitud`/`longitud` + DTO `PublicSolicitud`. | Modificar |
| `app/api/solicitudes-schemas.ts` | Esquema Zod de entrada de `create` (extraído para poder testearlo aislado). | Crear |
| `app/api/solicitudes-schemas.test.ts` | Tests del esquema de entrada (rangos + ambas-o-ninguna). | Crear |
| `app/api/solicitudes-router.ts` | Usar el esquema extraído + agregar lat/lng a `publicSolicitudSelect`. | Modificar |
| `app/api/queries/create-solicitud.ts` | `CreateSolicitudInput` con lat/lng (fluyen al insert). | Modificar |
| `app/api/queries/create-solicitud.test.ts` | Test: persiste coords cuando vienen; NULL cuando no. | Modificar |
| `app/db/migrations/0002_*.sql` | Migración generada por drizzle-kit. | Generar |
| `app/src/components/UbicacionPicker.tsx` | Mapa lazy para fijar un pin; devuelve `{lat,lng}`. | Crear |
| `app/src/components/UbicacionDetalle.tsx` | Botón "Cómo llegar" + Waze + toggle del mini-mapa en el detalle. | Crear |
| `app/src/components/MiniMapa.tsx` | Mapa de solo lectura (un pin); límite lazy con Leaflet. | Crear |
| `app/src/pages/NuevaSolicitud.tsx` | Bloque opcional de ubicación + envío de coords. | Modificar |
| `app/src/pages/DetalleSolicitud.tsx` | Render de `UbicacionDetalle` + enlace en WhatsApp. | Modificar |
| `app/package.json` | Dependencia `leaflet` + `@types/leaflet`. | Modificar |

---

## Task 1: Helpers de geolocalización (puros)

**Files:**
- Create: `app/src/lib/geo.ts`
- Test: `app/src/lib/geo.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// app/src/lib/geo.test.ts
import { describe, it, expect } from "vitest";
import {
  isValidLatLng,
  formatCoords,
  buildDirectionsUrl,
  buildWazeUrl,
  coordsFromPosition,
} from "./geo";

describe("isValidLatLng", () => {
  it("accepts coordinates inside the valid ranges", () => {
    expect(isValidLatLng(10.491, -66.879)).toBe(true);
    expect(isValidLatLng(-90, -180)).toBe(true);
    expect(isValidLatLng(90, 180)).toBe(true);
  });

  it("rejects out-of-range latitude or longitude", () => {
    expect(isValidLatLng(90.0001, 0)).toBe(false);
    expect(isValidLatLng(0, 180.5)).toBe(false);
  });

  it("rejects non-finite values", () => {
    expect(isValidLatLng(NaN, 0)).toBe(false);
    expect(isValidLatLng(0, Infinity)).toBe(false);
  });
});

describe("formatCoords", () => {
  it("formats to 6 decimals separated by a comma", () => {
    expect(formatCoords(10.4910001, -66.879)).toBe("10.491000, -66.879000");
  });
});

describe("buildDirectionsUrl", () => {
  it("builds a Google Maps directions URL to the destination", () => {
    expect(buildDirectionsUrl(10.491, -66.879)).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=10.491,-66.879",
    );
  });
});

describe("buildWazeUrl", () => {
  it("builds a Waze navigation URL", () => {
    expect(buildWazeUrl(10.491, -66.879)).toBe(
      "https://waze.com/ul?ll=10.491,-66.879&navigate=yes",
    );
  });
});

describe("coordsFromPosition", () => {
  it("extracts lat/lng from a GeolocationPosition-like object", () => {
    const pos = { coords: { latitude: 10.5, longitude: -66.9 } };
    expect(coordsFromPosition(pos)).toEqual({ lat: 10.5, lng: -66.9 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npx vitest run src/lib/geo.test.ts`
Expected: FAIL — cannot find module `./geo`.

- [ ] **Step 3: Write minimal implementation**

```ts
// app/src/lib/geo.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npx vitest run src/lib/geo.test.ts`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/geo.ts app/src/lib/geo.test.ts
git commit -m "feat(geo): helpers puros de validación y navegación de coordenadas"
```

---

## Task 2: Columnas lat/lng en el schema + DTO público

**Files:**
- Modify: `app/db/schema.ts`

- [ ] **Step 1: Add the columns to the `solicitudes` table**

En `app/db/schema.ts`, dentro de `export const solicitudes = mysqlTable("solicitudes", { ... })`, agregar después de la columna `notas` y antes de `createdAt`:

```ts
  // Punto geográfico opcional del lugar de entrega/retiro. Nullable: muchas
  // solicitudes no lo marcan (sin GPS/señal o es un hospital identificable
  // por nombre). Se usan para el botón "Cómo llegar" y el mapa del feed.
  // `double` devuelve un número JS directo (sin parseo) con precisión
  // más que suficiente para coordenadas.
  latitud: double("latitud"),
  longitud: double("longitud"),
```

- [ ] **Step 2: Import `double` from drizzle**

En la lista de imports al tope de `app/db/schema.ts`, agregar `double` (orden alfabético dentro del bloque existente):

```ts
import {
  double,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";
```

- [ ] **Step 3: Add lat/lng to the `PublicSolicitud` DTO**

En el `Pick<Solicitud, ...>` de `PublicSolicitud`, agregar `"latitud"` y `"longitud"` a la unión (después de `"notas"`):

```ts
  | "notas"
  | "latitud"
  | "longitud"
  | "createdAt"
  | "updatedAt"
```

- [ ] **Step 4: Typecheck**

Run: `cd app && npx tsc -b`
Expected: el único error es el preexistente de `src/components/Header.tsx` (`'LogIn' ... never read`). NINGÚN error nuevo en `schema.ts`.

- [ ] **Step 5: Commit**

```bash
git add app/db/schema.ts
git commit -m "feat(db): columnas latitud/longitud nullable + DTO público"
```

---

## Task 3: `createSolicitud` propaga las coordenadas

**Files:**
- Modify: `app/api/queries/create-solicitud.ts`
- Test: `app/api/queries/create-solicitud.test.ts`

- [ ] **Step 1: Write the failing tests**

En `app/api/queries/create-solicitud.test.ts`, dentro del `describe("createSolicitud", ...)` (después del test `"applies default urgencia and estatus on insert"`), agregar:

```ts
  it("persists latitud/longitud on the insert payload when provided", async () => {
    queueAttempt(1, 2);
    valuesMock.mockResolvedValueOnce([{ insertId: 1 }]);

    await createSolicitud({ ...baseInput, latitud: 10.491, longitud: -66.879 });

    const inserted = valuesMock.mock.calls[0]?.[0];
    expect(inserted.latitud).toBe(10.491);
    expect(inserted.longitud).toBe(-66.879);
  });

  it("omits coordinates from the payload when not provided", async () => {
    queueAttempt(1, 2);
    valuesMock.mockResolvedValueOnce([{ insertId: 1 }]);

    await createSolicitud(baseInput);

    const inserted = valuesMock.mock.calls[0]?.[0];
    expect(inserted.latitud).toBeUndefined();
    expect(inserted.longitud).toBeUndefined();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app && npx vitest run api/queries/create-solicitud.test.ts -t "latitud"`
Expected: FAIL — TypeScript/型 error o aserción falla porque `CreateSolicitudInput` aún no acepta `latitud`/`longitud`.

- [ ] **Step 3: Extend `CreateSolicitudInput`**

En `app/api/queries/create-solicitud.ts`, en la interfaz `CreateSolicitudInput`, agregar después de `notas?: string;`:

```ts
  latitud?: number;
  longitud?: number;
```

(No hace falta tocar el cuerpo de `createSolicitud`: ya hace `const values: SolicitudInsert = { ...input, ... }`, así que las coords fluyen al insert automáticamente.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app && npx vitest run api/queries/create-solicitud.test.ts`
Expected: PASS (todos, incluidos los dos nuevos).

- [ ] **Step 5: Commit**

```bash
git add app/api/queries/create-solicitud.ts app/api/queries/create-solicitud.test.ts
git commit -m "feat(api): createSolicitud propaga latitud/longitud al insert"
```

---

## Task 4: Esquema de entrada validado (rangos + ambas-o-ninguna)

**Files:**
- Create: `app/api/solicitudes-schemas.ts`
- Test: `app/api/solicitudes-schemas.test.ts`
- Modify: `app/api/solicitudes-router.ts`

- [ ] **Step 1: Write the failing test**

```ts
// app/api/solicitudes-schemas.test.ts
import { describe, it, expect } from "vitest";
import { createSolicitudInputSchema } from "./solicitudes-schemas";

const base = {
  medicamento: "Amoxicilina",
  principioActivo: "Amoxicilina",
  cantidad: "20",
  hospital: "Hospital Central",
  estado: "Distrito Capital",
  ciudad: "Libertador",
  telefono: "+584141234567",
  nombreSolicitante: "Dr. Pérez",
  rolSolicitante: "medico" as const,
};

describe("createSolicitudInputSchema — coordenadas", () => {
  it("acepta una solicitud sin coordenadas", () => {
    expect(createSolicitudInputSchema.safeParse(base).success).toBe(true);
  });

  it("acepta coordenadas válidas (ambas presentes)", () => {
    const r = createSolicitudInputSchema.safeParse({
      ...base,
      latitud: 10.491,
      longitud: -66.879,
    });
    expect(r.success).toBe(true);
  });

  it("rechaza latitud fuera de rango", () => {
    const r = createSolicitudInputSchema.safeParse({
      ...base,
      latitud: 91,
      longitud: -66.879,
    });
    expect(r.success).toBe(false);
  });

  it("rechaza longitud fuera de rango", () => {
    const r = createSolicitudInputSchema.safeParse({
      ...base,
      latitud: 10.491,
      longitud: -200,
    });
    expect(r.success).toBe(false);
  });

  it("rechaza una sola coordenada (regla ambas-o-ninguna)", () => {
    expect(
      createSolicitudInputSchema.safeParse({ ...base, latitud: 10.491 }).success,
    ).toBe(false);
    expect(
      createSolicitudInputSchema.safeParse({ ...base, longitud: -66.879 }).success,
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npx vitest run api/solicitudes-schemas.test.ts`
Expected: FAIL — cannot find module `./solicitudes-schemas`.

- [ ] **Step 3: Create the schema module**

```ts
// app/api/solicitudes-schemas.ts
import { z } from "zod";

// Esquema de entrada de `solicitudes.create`. Extraído del router para poder
// testear la validación (rangos de coordenadas + regla "ambas o ninguna")
// sin montar el router ni su grafo de dependencias.
export const createSolicitudInputSchema = z
  .object({
    medicamento: z.string().min(1).max(255),
    principioActivo: z.string().min(1).max(255),
    cantidad: z.string().min(1).max(100),
    dosis: z.string().max(100).optional(),
    hospital: z.string().min(1).max(255),
    estado: z.string().min(1).max(100),
    ciudad: z.string().min(1).max(100),
    telefono: z.string().min(1).max(50),
    nombreSolicitante: z.string().min(1).max(255),
    rolSolicitante: z.enum(["medico", "familiar", "personal_salud"]),
    inicialesPaciente: z.string().max(50).optional(),
    urgencia: z.enum(["critico", "moderado", "estable"]).optional(),
    notas: z.string().optional(),
    // Coordenadas opcionales del punto de entrega/retiro.
    latitud: z.number().min(-90).max(90).optional(),
    longitud: z.number().min(-180).max(180).optional(),
  })
  // "Ambas o ninguna": una coordenada sola no identifica un punto, así que
  // se rechaza para que el dato guardado sea siempre consistente.
  .refine(
    (v) => (v.latitud === undefined) === (v.longitud === undefined),
    {
      message: "latitud y longitud deben enviarse juntas",
      path: ["latitud"],
    },
  );

export type CreateSolicitudInputDto = z.infer<typeof createSolicitudInputSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npx vitest run api/solicitudes-schemas.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire the schema into the router**

En `app/api/solicitudes-router.ts`:

1. Agregar el import (junto a los otros imports del tope):

```ts
import { createSolicitudInputSchema } from "./solicitudes-schemas";
```

2. Reemplazar el bloque `create: publicQuery.input(z.object({ ... }))` para que use el esquema extraído. La definición de `create` debe quedar así:

```ts
  create: publicQuery
    .input(createSolicitudInputSchema)
    .mutation(async ({ input }) => {
      try {
        const result = await createSolicitud(input);
        return {
          id: result.id,
          pinGestion: result.pinGestion,
          pinCierre: result.pinCierre,
        };
      } catch (err) {
        if (err instanceof PinCollisionError) {
          throw new TRPCError({
            code: "CONFLICT",
            message: err.message,
          });
        }
        throw err;
      }
    }),
```

(El `input` ya incluye `latitud`/`longitud`, que `createSolicitud` propaga desde la Task 3.)

- [ ] **Step 6: Add lat/lng to `publicSolicitudSelect`**

En `app/api/solicitudes-router.ts`, dentro de `const publicSolicitudSelect = { ... }`, agregar después de `notas:`:

```ts
  latitud: schema.solicitudes.latitud,
  longitud: schema.solicitudes.longitud,
```

- [ ] **Step 7: Run the full backend test suite + typecheck**

Run: `cd app && npx vitest run api/ && npx tsc -b`
Expected: tests PASS; tsc solo con el error preexistente de `Header.tsx`.

- [ ] **Step 8: Commit**

```bash
git add app/api/solicitudes-schemas.ts app/api/solicitudes-schemas.test.ts app/api/solicitudes-router.ts
git commit -m "feat(api): validación de coordenadas en create + exposición en DTO"
```

---

## Task 5: Generar la migración 0002

**Files:**
- Generate: `app/db/migrations/0002_*.sql` (+ `meta/0002_snapshot.json`, `meta/_journal.json`)

- [ ] **Step 1: Generate the migration**

Run: `cd app && npx drizzle-kit generate`
Expected: crea `db/migrations/0002_<nombre>.sql` con `ALTER TABLE \`solicitudes\` ADD \`latitud\` double;` y otro `ADD \`longitud\` double;` (más actualización de `meta/`). `drizzle-kit generate` NO necesita base de datos (diff contra snapshots).

- [ ] **Step 2: Inspect the generated SQL**

Run: `cat db/migrations/0002_*.sql`
Expected: solo dos `ALTER TABLE ... ADD ... double;` (latitud y longitud), sin DROP ni cambios inesperados. Si aparece algo más, parar y revisar el schema.

- [ ] **Step 3: Commit the migration**

```bash
git add app/db/migrations/
git commit -m "feat(db): migración 0002 — columnas latitud/longitud"
```

- [ ] **Step 4: Document the DB application steps (no ejecutar si no hay DB)**

> ⚠️ Donde haya MySQL disponible, correr en orden:
> 1. `npm run db:migrate` (aplica 0002) o `npm run db:push`.
> 2. `npm run db:baseline` para re-baselinear el schema-contract, porque
>    `release:verify` corre `db:verify`. Sin re-baseline, el pipeline falla
>    aunque el schema esté correcto.
>
> Esto queda anotado en el PR como checklist para quien tenga acceso a la DB.

---

## Task 6: Captura en el formulario (GPS + mapa lazy)

**Files:**
- Modify: `app/package.json` (dependencia leaflet)
- Create: `app/src/components/UbicacionPicker.tsx`
- Modify: `app/src/pages/NuevaSolicitud.tsx`

- [ ] **Step 1: Add the Leaflet dependency**

Run:
```bash
cd app && npm install leaflet@^1.9.4 --save --no-package-lock --registry=https://registry.npmjs.org/ --no-audit --no-fund
npm install -D @types/leaflet@^1.9.12 --no-package-lock --registry=https://registry.npmjs.org/ --no-audit --no-fund
```
Expected: `leaflet` aparece en `dependencies` y `@types/leaflet` en `devDependencies` de `package.json`.

> Nota: en este repo el registro por defecto apunta a un mirror corporativo;
> los flags fuerzan el registro público y no reescriben el lockfile.

- [ ] **Step 2: Create the lazy map picker component**

```tsx
// app/src/components/UbicacionPicker.tsx
// Mapa para fijar un pin. Este componente es el límite lazy: se importa con
// import() dinámico desde NuevaSolicitud, de modo que Leaflet y su CSS quedan
// en un chunk aparte y NO entran al bundle inicial (clave para 3G).
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Centro por defecto: Venezuela (aprox.), zoom país.
const DEFAULT_CENTER: [number, number] = [6.42, -66.58];
const DEFAULT_ZOOM = 6;

type Props = {
  value: { lat: number; lng: number } | null;
  onChange: (coords: { lat: number; lng: number }) => void;
};

export default function UbicacionPicker({ value, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  // Mantener el handler actual sin re-suscribir el evento de click.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current).setView(
      value ? [value.lat, value.lng] : DEFAULT_CENTER,
      value ? 15 : DEFAULT_ZOOM,
    );
    mapRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap",
    }).addTo(map);

    if (value) {
      markerRef.current = L.marker([value.lat, value.lng]).addTo(map);
    }

    map.on("click", (e: L.LeafletMouseEvent) => {
      const coords = { lat: e.latlng.lat, lng: e.latlng.lng };
      if (markerRef.current) {
        markerRef.current.setLatLng(e.latlng);
      } else {
        markerRef.current = L.marker(e.latlng).addTo(map);
      }
      onChangeRef.current(coords);
    });

    // Leaflet necesita un recálculo de tamaño cuando el contenedor se monta
    // dentro de un bloque que acaba de aparecer.
    setTimeout(() => map.invalidateSize(), 0);

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // Solo se inicializa una vez; los updates de `value` externos no
    // re-crean el mapa (el usuario interactúa tocando).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={containerRef}
      className="h-64 w-full rounded-lg border border-zinc-300"
      role="application"
      aria-label="Mapa para marcar la ubicación"
    />
  );
}
```

- [ ] **Step 3: Add coordinate state + UI block to the form**

En `app/src/pages/NuevaSolicitud.tsx`:

1. Imports nuevos (junto a los existentes):

```tsx
import { lazy, Suspense } from "react";
import { coordsFromPosition, formatCoords } from "@/lib/geo";

const UbicacionPicker = lazy(() => import("@/components/UbicacionPicker"));
```

2. En el tipo `FormData`, agregar:

```tsx
  latitud: number | null;
  longitud: number | null;
```

3. En el estado inicial del form (`useState<FormData>({ ... })`), agregar:

```tsx
  latitud: null,
  longitud: null,
```

4. Dentro del componente, agregar estado local para el mapa y handlers (cerca de `handleSubmit`):

```tsx
  const [showMap, setShowMap] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  const setCoords = (coords: { lat: number; lng: number } | null) => {
    setForm((prev) => ({
      ...prev,
      latitud: coords ? coords.lat : null,
      longitud: coords ? coords.lng : null,
    }));
  };

  const handleUsarMiUbicacion = () => {
    setGeoError(null);
    if (!navigator.geolocation) {
      setGeoError("Tu navegador no permite obtener la ubicación.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords(coordsFromPosition(pos)),
      () =>
        setGeoError(
          "No se pudo obtener tu ubicación. Podés marcarla en el mapa.",
        ),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };
```

5. En el envío (`createMutation.mutate({ ... })`), agregar al objeto (la regla ambas-o-ninguna se respeta porque ambas viajan juntas o ambas van `undefined`):

```tsx
      latitud: form.latitud ?? undefined,
      longitud: form.longitud ?? undefined,
```

6. En el JSX, dentro de la sección "Ubicación y Contacto" (después del bloque de Municipio, antes del campo Teléfono), insertar:

```tsx
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                  Ubicación exacta{" "}
                  <span className="text-zinc-400 font-normal">(opcional)</span>
                </label>
                <p className="text-xs text-zinc-500 mb-2">
                  Ayuda a quien dona a llegar con una ruta más clara.
                </p>

                {form.latitud != null && form.longitud != null ? (
                  <div className="flex items-center justify-between gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                    <span className="text-sm text-green-800">
                      Ubicación marcada ✓{" "}
                      <span className="font-mono text-xs text-green-700">
                        {formatCoords(form.latitud, form.longitud)}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setCoords(null)}
                      className="text-xs text-green-700 underline"
                    >
                      Quitar
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleUsarMiUbicacion}
                      className="h-10 px-3 rounded-lg border border-zinc-300 text-sm bg-white"
                    >
                      📍 Usar mi ubicación
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowMap((s) => !s)}
                      className="h-10 px-3 rounded-lg border border-zinc-300 text-sm bg-white"
                    >
                      {showMap ? "Ocultar mapa" : "Marcar en el mapa"}
                    </button>
                  </div>
                )}

                {geoError && (
                  <p className="text-xs text-red-500 mt-1">{geoError}</p>
                )}

                {showMap && form.latitud == null && (
                  <div className="mt-2">
                    <Suspense
                      fallback={
                        <div className="h-64 w-full rounded-lg border border-zinc-200 flex items-center justify-center text-sm text-zinc-400">
                          Cargando mapa…
                        </div>
                      }
                    >
                      <UbicacionPicker
                        value={
                          form.latitud != null && form.longitud != null
                            ? { lat: form.latitud, lng: form.longitud }
                            : null
                        }
                        onChange={(c) => {
                          setCoords(c);
                          setShowMap(false);
                        }}
                      />
                    </Suspense>
                  </div>
                )}
              </div>
```

- [ ] **Step 4: Typecheck + lint**

Run: `cd app && npx tsc -b && npx eslint src/components/UbicacionPicker.tsx src/pages/NuevaSolicitud.tsx`
Expected: tsc solo con el error preexistente de `Header.tsx`; eslint sin errores en los dos archivos.

- [ ] **Step 5: Commit**

```bash
git add app/package.json app/src/components/UbicacionPicker.tsx app/src/pages/NuevaSolicitud.tsx
git commit -m "feat(ui): captura opcional de ubicación (GPS + mapa lazy) en el form"
```

---

## Task 7: Navegación en el detalle ("Cómo llegar" + mini-mapa lazy)

**Files:**
- Create: `app/src/components/UbicacionDetalle.tsx`
- Create: `app/src/components/MiniMapa.tsx`
- Modify: `app/src/pages/DetalleSolicitud.tsx`

- [ ] **Step 1: Create the detail location component**

```tsx
// app/src/components/UbicacionDetalle.tsx
// Bloque de navegación del detalle: botón "Cómo llegar" (handoff a Google
// Maps/Waze) y un mini-mapa lazy COLAPSADO por defecto (no descarga tiles
// hasta que el usuario lo expande). El mapa se importa con import() dinámico.
import { lazy, Suspense, useState } from "react";
import { Navigation } from "lucide-react";
import { buildDirectionsUrl, buildWazeUrl, formatCoords } from "@/lib/geo";

const MiniMapa = lazy(() => import("./MiniMapa"));

type Props = { lat: number; lng: number };

export default function UbicacionDetalle({ lat, lng }: Props) {
  const [showMap, setShowMap] = useState(false);

  return (
    <div className="space-y-3">
      <a
        href={buildDirectionsUrl(lat, lng)}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 w-full h-12 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium"
      >
        <Navigation className="w-4 h-4" />
        Cómo llegar
      </a>
      <div className="flex items-center justify-between text-xs text-zinc-500">
        <a
          href={buildWazeUrl(lat, lng)}
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          Abrir en Waze
        </a>
        <button
          type="button"
          onClick={() => setShowMap((s) => !s)}
          className="underline"
        >
          {showMap ? "Ocultar mapa" : "Ver mapa"}
        </button>
      </div>
      <p className="text-xs text-zinc-400 font-mono">{formatCoords(lat, lng)}</p>

      {showMap && (
        <Suspense
          fallback={
            <div className="h-56 w-full rounded-lg border border-zinc-200 flex items-center justify-center text-sm text-zinc-400">
              Cargando mapa…
            </div>
          }
        >
          <MiniMapa lat={lat} lng={lng} />
        </Suspense>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create the read-only mini map**

```tsx
// app/src/components/MiniMapa.tsx
// Mapa de solo lectura que muestra un pin. Límite lazy: Leaflet + CSS quedan
// en un chunk aparte, cargado solo cuando el usuario expande "Ver mapa".
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

type Props = { lat: number; lng: number };

export default function MiniMapa({ lat, lng }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      zoomControl: true,
      scrollWheelZoom: false,
    }).setView([lat, lng], 15);
    mapRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap",
    }).addTo(map);

    L.marker([lat, lng]).addTo(map);
    setTimeout(() => map.invalidateSize(), 0);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [lat, lng]);

  return (
    <div
      ref={containerRef}
      className="h-56 w-full rounded-lg border border-zinc-300"
      role="application"
      aria-label="Mapa de la ubicación"
    />
  );
}
```

- [ ] **Step 3: Render it in the detail page**

En `app/src/pages/DetalleSolicitud.tsx`:

1. Import nuevo:

```tsx
import UbicacionDetalle from "@/components/UbicacionDetalle";
import { buildDirectionsUrl } from "@/lib/geo";
```

2. Dentro del bloque de "Action buttons" (después de `<ShareButton .../>` y antes del cierre del `div` de acciones), agregar el bloque condicional:

```tsx
              {solicitud.latitud != null && solicitud.longitud != null && (
                <UbicacionDetalle
                  lat={solicitud.latitud}
                  lng={solicitud.longitud}
                />
              )}
```

3. Enriquecer el mensaje de WhatsApp con el enlace de mapas cuando haya coords. Reemplazar el `message={...}` del `<WhatsAppButton ... />` por:

```tsx
                message={
                  `Hola ${solicitud.nombreSolicitante}, vi tu solicitud en MedVene para ${solicitud.medicamento} (${solicitud.principioActivo}) en ${solicitud.hospital}. Quiero ayudar. ¿Aún lo necesitas?` +
                  (solicitud.latitud != null && solicitud.longitud != null
                    ? `\nUbicación: ${buildDirectionsUrl(
                        solicitud.latitud,
                        solicitud.longitud,
                      )}`
                    : "")
                }
```

- [ ] **Step 4: Typecheck + lint**

Run: `cd app && npx tsc -b && npx eslint src/components/UbicacionDetalle.tsx src/components/MiniMapa.tsx src/pages/DetalleSolicitud.tsx`
Expected: tsc solo con el error preexistente de `Header.tsx`; eslint limpio en los archivos nuevos/modificados.

- [ ] **Step 5: Commit**

```bash
git add app/src/components/UbicacionDetalle.tsx app/src/components/MiniMapa.tsx app/src/pages/DetalleSolicitud.tsx
git commit -m "feat(ui): botón 'Cómo llegar' + mini-mapa lazy en el detalle"
```

---

## Task 8: Verificación completa + build + PR

**Files:** ninguno nuevo (verificación e integración).

- [ ] **Step 1: Run the full test suite**

Run: `cd app && npx vitest run`
Expected: PASS (incluye geo, schemas, create-solicitud y los tests existentes).

- [ ] **Step 2: Lint the whole project**

Run: `cd app && npm run lint`
Expected: sin errores en archivos nuevos/modificados. (Si aparece solo el `LogIn` preexistente de `Header.tsx`, está fuera de alcance — anotarlo en el PR; no arreglarlo en este PR salvo que se decida lo contrario.)

- [ ] **Step 3: Production build (confirma code-splitting del mapa)**

Run: `cd app && npm run build`
Expected: build OK. En la salida de Vite debe verse un **chunk separado** para Leaflet/los componentes de mapa (no incluido en el entry principal), confirmando el lazy-load.

- [ ] **Step 4: Manual smoke (donde haya entorno)**

Run: `cd app && npm run dev` → abrir `http://localhost:3000/solicitar`.
Verificar: el bloque "Ubicación exacta (opcional)" aparece; "Usar mi ubicación" pide permiso y marca; "Marcar en el mapa" carga el mapa lazy y al tocar fija el pin y muestra las coords.

- [ ] **Step 5: Push and open the PR to `main`**

```bash
git push -u origin feat/ubicacion-geografica
```
Luego abrir el PR a `main` desde la URL que imprime GitHub. **Solo PR, sin merge/integración directa.** En la descripción del PR incluir el checklist de DB de la Task 5 (migrate + baseline) para quien tenga acceso a la base de datos.

---

## Notas de cierre

- **Fuera de alcance (Fase 1):** mapa del feed (Fase 2), enlaces cortos de Google, geocoding, auto-centrado por estado.
- **Dependencia de DB:** la migración 0002 se genera y commitea sin DB, pero `db:migrate` + `db:baseline` requieren MySQL y se ejecutan donde haya acceso (documentado en el PR).
- **Tile provider:** OSM estándar con atribución; a escala de producción puede requerir un proveedor propio por la política de uso de OSM.
