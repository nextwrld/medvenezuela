import { describe, it, expect } from "vitest";
import { mapPointSelect } from "./solicitudes-router";

describe("mapPointSelect", () => {
  it("expone solo los campos livianos del mapa", () => {
    expect(Object.keys(mapPointSelect).sort()).toEqual(
      ["id", "latitud", "longitud", "medicamento", "urgencia"].sort(),
    );
  });

  it("nunca expone credenciales (pinGestion/pinCierre)", () => {
    expect(Object.keys(mapPointSelect)).not.toContain("pinGestion");
    expect(Object.keys(mapPointSelect)).not.toContain("pinCierre");
  });
});
