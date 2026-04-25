import { defineConfig } from "drizzle-kit";

const host = process.env.DB_HOST || "localhost";
const port = process.env.DB_PORT || "3306";
const user = process.env.DB_USER || "root";
const pass = process.env.DB_PASSWORD ? `:${process.env.DB_PASSWORD}` : "";
const db = process.env.DB_NAME || "viralcut";
const url = `mysql://${user}${pass}@${host}:${port}/${db}`;

export default defineConfig({
  schema: "./src/schema/index.ts",
  dialect: "mysql",
  dbCredentials: { url },
});
