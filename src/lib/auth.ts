import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { db } from "@/db/client";
import { profiles } from "@/db/schema";

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
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
