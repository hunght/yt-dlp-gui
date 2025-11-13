import type { Config } from "jest";

const config: Config = {
  clearMocks: true,
  collectCoverage: false, // Disable coverage for database tests
  coverageDirectory: "coverage",
  coverageProvider: "v8",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  setupFilesAfterEnv: ["<rootDir>/src/tests/unit/setup.ts"],
  roots: ["<rootDir>/src"],
  testEnvironment: "node", // Use Node.js environment for database tests
  transform: {
    "^.+\\.(t|j)sx?$": "@swc/jest",
  },
  // Only run database-related tests
  testPathIgnorePatterns: [
    "/node_modules/",
    ".*\\.(tsx|jsx)$", // Ignore React component tests
  ],
  // Only include database test files
  testMatch: ["**/tests/unit/*router*.test.ts", "**/tests/unit/example-trpc-test.ts"],
};

export default config;
