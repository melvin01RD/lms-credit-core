import { defineConfig } from "vitest/config";
import path from "node:path";

const url = process.env.FINANCIAL_TEST_DATABASE_URL;
if (!url) throw new Error("FINANCIAL_TEST_DATABASE_URL is required for PostgreSQL integration tests");
const parsed = new URL(url);
if (!["127.0.0.1", "localhost"].includes(parsed.hostname) || parsed.pathname !== "/lms_finance_test" || parsed.port !== "55440") {
  throw new Error("Financial integration tests only allow local lms_finance_test on port 55440");
}
process.env.DATABASE_URL = url;
export default defineConfig({
  test: { environment: "node", include: ["src/tests/integration/financial.test.ts"],
    fileParallelism: false, testTimeout: 30000, hookTimeout: 30000 },
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
});
