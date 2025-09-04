import "@testing-library/jest-dom";
import { TextEncoder, TextDecoder } from "util";

// Add polyfills for Node.js environment
Object.assign(global, {
  TextEncoder,
  TextDecoder,
});

// Mock fetch if needed for Node.js environment
if (typeof global.fetch === "undefined") {
  global.fetch = jest.fn() as any;
  global.Request = jest.fn() as any;
  global.Response = jest.fn() as any;
  global.Headers = jest.fn() as any;
}
