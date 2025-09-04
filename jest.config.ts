import type { Config } from "jest";

const config: Config = {
  clearMocks: true,

  collectCoverage: true,

  coverageDirectory: "coverage",

  coverageProvider: "v8",

  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },

  testMatch: ["**/*.test.ts"],
  setupFilesAfterEnv: ["<rootDir>/src/tests/unit/setup.ts"],
  roots: ["<rootDir>/src"],

  testEnvironment: "node",

  transform: {
    "^.+\\.(t|j)sx?$": "@swc/jest",
  },

  // Set NODE_ENV for tests
  setupFiles: ["<rootDir>/src/tests/unit/test-env.ts"],
};

export default config;
