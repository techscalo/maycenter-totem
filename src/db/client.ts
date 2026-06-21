import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as appSchema from "./schema";
import * as authSchema from "./auth-schema";

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error("Missing DATABASE_URL environment variable (Neon connection string)");
}

const schema = { ...appSchema, ...authSchema };

const sql = neon(DATABASE_URL);

export const db = drizzle(sql, { schema });
export { schema };
