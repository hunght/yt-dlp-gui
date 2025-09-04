# tRPC Procedure Tests with Real SQLite Database

This directory contains comprehensive tests for tRPC procedures using a real SQLite database with Drizzle ORM. Unlike mock-based tests, these tests use actual database operations to ensure your procedures work correctly with real data.

## Test Setup

### Database Setup
- Each test gets its own isolated SQLite database
- Databases are automatically created and cleaned up
- Migrations are run automatically to set up the schema
- Test data is seeded for consistent testing

### Test Utilities
- `createTestDatabase()` - Creates a unique test database
- `createTestCaller()` - Creates a tRPC caller with test database context
- `seedTestDatabase()` - Seeds the database with sample data
- Helper functions for common assertions

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run only unit tests
npm run test:unit
```

## Test Structure

### Basic Test Pattern

```typescript
import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { createTestDatabase, seedTestDatabase, type TestDatabase } from "./test-db-setup";
import { createTestCaller } from "./test-utils";

describe("Your Router Tests", () => {
  let testDb: TestDatabase;

  beforeEach(async () => {
    testDb = await createTestDatabase("your-test-name");
    await seedTestDatabase(testDb.db);
  });

  afterEach(async () => {
    await testDb.cleanup();
  });

  it("should test your procedure", async () => {
    const caller = createTestCaller(testDb);

    const result = await caller.yourRouter.yourProcedure({
      // your input
    });

    expect(result).toEqual(/* expected result */);
  });
});
```

### Query Procedure Tests

```typescript
it("getById returns user", async () => {
  const caller = createTestCaller(testDb);

  const result = await caller.user.getById({ id: "1" });

  expect(result).toEqual({ id: "1", name: "Mock User" });
});

it("getById returns null if user not found", async () => {
  const caller = createTestCaller(testDb);

  const result = await caller.user.getById({ id: "999" });

  expect(result).toBeNull();
});
```

### Mutation Procedure Tests

```typescript
it("createUser creates new user", async () => {
  const caller = createTestCaller(testDb);

  const result = await caller.user.createUser({
    name: "New User",
    email: "new@example.com"
  });

  expect(result).toHaveProperty("id");
  expect(result.name).toBe("New User");

  // Verify user was created in database
  const user = await testDb.db
    .select()
    .from(users)
    .where(eq(users.id, result.id))
    .limit(1);

  expect(user).toHaveLength(1);
});
```

## Available Test Files

- `test-db-setup.ts` - Database setup and utilities
- `test-utils.ts` - Test helper functions and utilities
- `download-router.test.ts` - Tests for download router procedures
- `youtube-router.test.ts` - Tests for YouTube router procedures
- `example-trpc-test.ts` - Example tests demonstrating patterns

## Test Utilities

### Database Utilities
- `createTestDatabase(testName)` - Creates isolated test database
- `createSharedTestDatabase()` - Creates shared test database for integration tests
- `seedTestDatabase(db)` - Seeds database with sample data
- `clearTestDatabase(db)` - Clears all data from database

### Test Helpers
- `createTestCaller(testDb)` - Creates tRPC caller with test context
- `createMockVideoInfo(overrides)` - Creates mock video info object
- `createMockDownload(overrides)` - Creates mock download object
- `expectDownloadExists(testDb, id, expectedData)` - Asserts download exists
- `expectVideoExists(testDb, id, expectedData)` - Asserts video exists

### Test Suites
- `createTestSuite(name, testFn)` - Creates test suite with database setup
- `createSharedTestSuite(name, testFn)` - Creates shared test suite

## Best Practices

1. **Isolation**: Each test gets its own database to avoid interference
2. **Cleanup**: Always clean up test databases in `afterEach`
3. **Seeding**: Use `seedTestDatabase()` for consistent test data
4. **Assertions**: Verify both return values and database state
5. **Error Cases**: Test both success and error scenarios
6. **Edge Cases**: Test with empty data, invalid inputs, etc.

## Example Test Cases

### Testing Queries
- Return correct data
- Handle empty results
- Filter and sort correctly
- Paginate properly

### Testing Mutations
- Create new records
- Update existing records
- Delete records
- Validate input
- Handle errors gracefully

### Testing Edge Cases
- Invalid input validation
- Non-existent records
- Empty database
- Network errors (for external APIs)

## Database Schema

The tests use the same schema as your production database:
- `downloads` table - Download records
- `youtube_videos` table - YouTube video metadata

## Migration

The test setup automatically runs migrations to ensure the database schema is up to date. Make sure to run `npm run db:generate` and `npm run db:migrate` when you change the schema.

## Performance

- Tests use in-memory SQLite for speed
- Each test is isolated for parallel execution
- Database cleanup is automatic
- No network calls to external services in most tests
