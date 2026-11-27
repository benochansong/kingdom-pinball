import { defineConfig } from "vitest/config";
// Physics suites are CPU-heavy. Bound concurrency to avoid starving the live preview.
export default defineConfig({ test: { maxWorkers: 2 } });
