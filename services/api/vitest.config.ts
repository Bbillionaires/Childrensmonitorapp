import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    testTimeout: 20000,
    hookTimeout: 20000,
    // These are integration tests against one real, shared Postgres database (not a mock),
    // and each file's beforeEach truncates shared tables (users, content). Running test
    // files in parallel would let one file's cleanup race another file's in-flight test —
    // so files run sequentially; tests within a file still run in the usual order.
    fileParallelism: false,
  },
});
