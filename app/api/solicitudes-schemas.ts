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
