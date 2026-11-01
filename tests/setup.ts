import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
  // Backend tests run in the node environment, which has no localStorage.
  globalThis.localStorage?.clear();
});
