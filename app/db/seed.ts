// Seed data for reference - Estados de Venezuela
export const ESTADOS_VENEZUELA = [
  "Distrito Capital",
  "La Guaira",
  "Carabobo",
  "Aragua",
  "Miranda",
  "Zulia",
  "Mérida",
  "Táchira",
  "Trujillo",
  "Lara",
  "Falcón",
  "Yaracuy",
  "Portuguesa",
  "Barinas",
  "Apure",
  "Guárico",
  "Cojedes",
  "Bolívar",
  "Amazonas",
  "Delta Amacuro",
  "Sucre",
  "Nueva Esparta",
  "Monagas",
  "Anzoátegui",
] as const;

export type EstadoVenezuela = (typeof ESTADOS_VENEZUELA)[number];

// Zonas priorizadas por la emergencia sísmica
export const ZONAS_EMERGENCIA = [
  "La Guaira",
  "Carabobo",
  "Aragua",
  "Miranda",
  "Distrito Capital",
] as const;

async function seed() {
  console.log("Seed data ready. Estados Venezuela:", ESTADOS_VENEZUELA.length);
  console.log("Zonas emergencia:", ZONAS_EMERGENCIA.join(", "));
}

seed().catch(console.error);
