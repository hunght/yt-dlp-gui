import "@testing-library/jest-dom";
import { TextEncoder, TextDecoder } from "util";

// Add polyfills for Node.js environment
Object.assign(global, {
  TextEncoder,
  TextDecoder,
});

// Mock fetch if needed for Node.js environment
if (typeof global.fetch === "undefined") {
  Object.defineProperty(global, "fetch", { value: jest.fn(), writable: true });
  Object.defineProperty(global, "Request", { value: jest.fn(), writable: true });
  Object.defineProperty(global, "Response", { value: jest.fn(), writable: true });
  Object.defineProperty(global, "Headers", { value: jest.fn(), writable: true });
}
