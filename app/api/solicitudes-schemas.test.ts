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
