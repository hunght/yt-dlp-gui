import "@testing-library/jest-dom";
import { TextEncoder, TextDecoder } from "util";

// Add polyfills for Node.js environment
Object.assign(global, {
  TextEncoder,
  TextDecoder,
});

// Mock fetch if needed for Node.js environment
if (typeof global.fetch === "undefined") {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  global.fetch = jest.fn() as unknown as typeof fetch;
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  global.Request = jest.fn() as unknown as typeof Request;
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  global.Response = jest.fn() as unknown as typeof Response;
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  global.Headers = jest.fn() as unknown as typeof Headers;
}
