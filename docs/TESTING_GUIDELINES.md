# Testing Guidelines

## Test File Location Rules

### MANDATORY: Co-locate Tests with Source Code

**All test files must be placed next to the source files they test.**

```
✅ GOOD - Tests co-located with source code:
src/
├── api/
│   ├── routers/
│   │   ├── download/
│   │   │   ├── index.ts              # Source file
│   │   │   ├── index.test.ts         # Test file - same directory
│   │   │   ├── service.ts            # Source file  
│   │   │   ├── service.test.ts       # Test file - same directory
│   │   │   └── types.ts              # Type definitions
│   │   └── user/
│   │       ├── get-user.ts           # Source file
│   │       ├── get-user.test.ts      # Test file - same directory
│   │       ├── create-user.ts        # Source file
│   │       └── create-user.test.ts   # Test file - same directory

❌ BAD - Tests separated in distant folders:
src/
├── api/routers/download/index.ts     # Source file
└── tests/unit/download-router.test.ts # Test file - far away
```

### Benefits of Co-location:

1. **Easy Discovery**: Find tests immediately when working on source code
2. **Better Maintenance**: Tests stay in sync with code changes
3. **Clear Relationships**: Obvious which test belongs to which source file
4. **Faster Development**: No navigation between distant folders
5. **Better Organization**: Tests become part of the module structure

### Naming Convention:

- **Source file**: `filename.ts`
- **Test file**: `filename.test.ts`
- **Type definitions**: `filename.types.ts` (if needed)

### Import Path Updates:

When co-locating tests, update import paths to reference shared test utilities:

```typescript
// ✅ GOOD - Relative paths to test utilities
import { createTestDatabase } from "../../../tests/unit/test-db-setup";
import { createDownloadTestCaller } from "../../../tests/unit/test-utils";

// ❌ BAD - Relative paths from old location
import { createTestDatabase } from "./test-db-setup";
```

### Test File Structure:

Each test file should:

1. **Import test utilities** from shared test helpers
2. **Import the source code** being tested (usually from `./index` or `./filename`)
3. **Follow the describe/it pattern** for clear test organization
4. **Include cleanup logic** for any resources created during tests

### Examples:

```typescript
// src/api/routers/download/index.test.ts
import { describe, it, expect } from "@jest/globals";
import { createTestDatabase } from "../../../tests/unit/test-db-setup";
import { downloadRouter } from "./index"; // Import from same directory

describe("Download Router", () => {
  it("should handle downloads correctly", async () => {
    // Test implementation
  });
});
```

```typescript
// src/services/user/get-user.test.ts  
import { describe, it, expect } from "@jest/globals";
import { createTestDatabase } from "../../tests/unit/test-db-setup";
import { getUser } from "./get-user"; // Import from same directory

describe("getUser", () => {
  it("should retrieve user by id", async () => {
    // Test implementation
  });
});
```

### Migration Strategy:

When moving existing tests:

1. **Create new test file** in the same directory as source code
2. **Update import paths** to reference shared utilities
3. **Verify tests pass** in new location
4. **Delete old test file** from previous location
5. **Update Jest configuration** if necessary to find tests in new locations

### Jest Configuration:

Ensure Jest can find co-located tests by updating the test pattern:

```javascript
// jest.config.ts
export default {
  testMatch: [
    "**/__tests__/**/*.(ts|js)",
    "**/*.(test|spec).(ts|js)"  // This finds *.test.ts anywhere
  ],
  // ... other config
};
```

This rule ensures our test suite remains maintainable and follows modern best practices for test organization.
