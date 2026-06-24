import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { db } from "@/db/client";
import { profiles } from "@/db/schema";

// Orígenes permitidos para el chequeo de CSRF de Better Auth. Incluye el baseURL
// y los dominios extra de BETTER_AUTH_TRUSTED_ORIGINS (coma-separados), p.ej. el
// dominio custom + el de vercel.app. Sin esto, otro dominio da "Invalid origin".
const trustedOrigins = [
  process.env.BETTER_AUTH_URL,
  ...(process.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(",").map((s) => s.trim()) ?? []),
].filter((v): v is string => !!v);

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins,
  database: drizzleAdapter(db, { provider: "pg" }),
  emailAndPassword: {
    enabled: true,
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          // Equivalente al trigger handle_new_user de Supabase
          await db
            .insert(profiles)
            .values({ userId: user.id, nombre: user.name || user.email })
            .onConflictDoNothing();
        },
      },
    },
  },
  plugins: [tanstackStartCookies()],
});
