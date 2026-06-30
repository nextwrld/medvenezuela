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
