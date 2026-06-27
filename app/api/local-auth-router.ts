import { z } from "zod";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { eq } from "drizzle-orm";
import { createRouter, publicQuery } from "./middleware";
import { getDb } from "./queries/connection";
import * as schema from "@db/schema";
import { env } from "./lib/env";

// `env.appSecret` is the sole source of truth. The previous
// implementation used a hardcoded fallback that masked misconfigured
// production secrets; env validation at boot (`api/lib/env.ts`) now
// guarantees `appSecret` is set, so no fallback is needed.
const JWT_SECRET = env.appSecret;

function signLocalToken(payload: {
  id: number;
  username: string;
  role: string;
}): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "30d" });
}

export function verifyLocalToken(
  token: string
): { id: number; username: string; role: string } | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as {
      id: number;
      username: string;
      role: string;
    };
    return decoded;
  } catch {
    return null;
  }
}

export const localAuthRouter = createRouter({
  register: publicQuery
    .input(
      z.object({
        username: z
          .string()
          .min(3, "Mínimo 3 caracteres")
          .max(100)
          .regex(
            /^[a-zA-Z0-9_]+$/,
            "Solo letras, números y guiones bajos"
          ),
        password: z.string().min(6, "Mínimo 6 caracteres").max(100),
        displayName: z.string().min(1).max(255),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDb();

      // Check if username already exists
      const existing = await db
        .select()
        .from(schema.localUsers)
        .where(eq(schema.localUsers.username, input.username))
        .limit(1);

      if (existing.length > 0) {
        return {
          success: false,
          error: "Este nombre de usuario ya está registrado",
          token: null,
        };
      }

      const passwordHash = await bcrypt.hash(input.password, 10);

      const result = await db.insert(schema.localUsers).values({
        username: input.username,
        passwordHash,
        displayName: input.displayName,
      });

      const insertId = Number(result[0].insertId);

      const token = signLocalToken({
        id: insertId,
        username: input.username,
        role: "user",
      });

      return { success: true, error: null, token };
    }),

  login: publicQuery
    .input(
      z.object({
        username: z.string().min(1),
        password: z.string().min(1),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDb();

      const rows = await db
        .select()
        .from(schema.localUsers)
        .where(eq(schema.localUsers.username, input.username))
        .limit(1);

      const user = rows.at(0);
      if (!user) {
        return {
          success: false,
          error: "Usuario o contraseña incorrectos",
          token: null,
        };
      }

      const valid = await bcrypt.compare(input.password, user.passwordHash);
      if (!valid) {
        return {
          success: false,
          error: "Usuario o contraseña incorrectos",
          token: null,
        };
      }

      const token = signLocalToken({
        id: user.id,
        username: user.username,
        role: user.role,
      });

      return { success: true, error: null, token };
    }),

  me: publicQuery.query(async ({ ctx }) => {
    const req = ctx.req;
    const token = req.headers.get("x-local-auth-token");

    if (!token) return null;

    const decoded = verifyLocalToken(token);
    if (!decoded) return null;

    const db = getDb();
    const rows = await db
      .select()
      .from(schema.localUsers)
      .where(eq(schema.localUsers.id, decoded.id))
      .limit(1);

    const user = rows.at(0);
    if (!user) return null;

    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
    };
  }),
});
