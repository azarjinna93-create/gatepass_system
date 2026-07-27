import { drizzle } from "drizzle-orm/postgres-js";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

declare global {
  var __dbClient: postgres.Sql | undefined;
  var __db: PostgresJsDatabase<typeof schema> | undefined;
}

type Db = PostgresJsDatabase<typeof schema>;

function createDb(): Db {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not set");
  }

  // Reuse the connection across hot reloads / serverless invocations of the
  // same instance instead of opening a new pool on every import.
  const client =
    global.__dbClient ??
    postgres(connectionString, {
      max: process.env.NODE_ENV === "production" ? 10 : 1,
    });

  if (process.env.NODE_ENV !== "production") {
    global.__dbClient = client;
  }

  return drizzle(client, { schema });
}

function getDb(): Db {
  if (!global.__db) {
    global.__db = createDb();
  }
  return global.__db;
}

// Lazy proxy so importing this module during `next build` does not require
// DATABASE_URL until a route actually queries the database.
export const db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    const instance = getDb();
    const value = Reflect.get(instance, prop, receiver);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});

/**
 * Drizzle's `.returning()` types as `T[]` even for a single-row insert/update,
 * so TS (with noUncheckedIndexedAccess) treats `rows[0]` as possibly
 * undefined. Use this right after an insert/update you know affected exactly
 * one row, to get a non-nullable result without scattering `!` assertions.
 */
export function firstOrThrow<T>(rows: T[]): T {
  const row = rows[0];
  if (row === undefined) {
    throw new Error("Expected at least one row, got none");
  }
  return row;
}
