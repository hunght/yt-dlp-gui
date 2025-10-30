# YT-DLP GUI Monorepo

A modern YouTube downloader GUI built with Electron and React, organized as a monorepo using npm workspaces and Turborepo.

## 📦 Project Structure

```
yt-dlp-gui/
├── apps/
│   └── electron/          # Main Electron application
├── packages/
│   ├── database/          # Shared database schema and types
│   └── tsconfig/          # Shared TypeScript configurations
├── package.json           # Root workspace configuration
└── turbo.json            # Turborepo pipeline configuration
```

## 🚀 Getting Started

### Prerequisites

- **Node.js**: >= 18.0.0
- **npm**: >= 9.0.0

### Installation

1. Clone the repository:
```bash
git clone https://github.com/hunght/yt-dlp-gui.git
cd yt-dlp-gui
```

2. Install dependencies (from the root):
```bash
npm install
```

This will install dependencies for all workspaces automatically.

## 🛠️ Development

### Running the Application

From the root directory:

```bash
# Start the Electron app in development mode
npm run dev

# Or run it from the electron workspace
npm run dev --workspace=apps/electron
```

### Building

```bash
# Build all packages
npm run build

# Build specific workspace
npm run build --workspace=packages/database
```

### Testing

```bash
# Run all tests
npm run test

# Run tests in watch mode
npm run test:watch

# Run database tests
npm run test:database --workspace=apps/electron

# Run E2E tests
npm run test:e2e --workspace=apps/electron
```

### Type Checking

```bash
# Type check all workspaces
npm run type-check
```

## 📚 Workspaces

### @yt-dlp-gui/electron

The main Electron application with React UI.

**Key Scripts:**
- `npm run dev --workspace=apps/electron` - Start development server
- `npm run make --workspace=apps/electron` - Build distributable
- `npm run test --workspace=apps/electron` - Run tests

### @yt-dlp-gui/database

Shared database schema, types, migrations, and utilities using Drizzle ORM.

**Key Features:**
- Centralized schema and migrations
- Type-safe database access
- Configurable database path per application

**Key Scripts:**
- `npm run build --workspace=packages/database` - Build package
- `npm run dev --workspace=packages/database` - Watch mode
- `DATABASE_URL="file:./local.db" npm run db:generate --workspace=packages/database` - Generate migrations
- `DATABASE_URL="file:./local.db" npm run db:studio --workspace=packages/database` - Open Drizzle Studio

See [packages/database/README.md](packages/database/README.md) for detailed usage.

### @yt-dlp-gui/tsconfig

Shared TypeScript configurations for consistent type checking across the monorepo.

## 🗄️ Database Management

### Schema and Migrations

The database schema and migrations are centralized in `packages/database/`:
- **Schema**: `packages/database/src/schema.ts`
- **Migrations**: `packages/database/drizzle/`
- **Config**: Each app has its own `drizzle.config.ts` with app-specific database path

### From the Database Package (Shared)

```bash
# Generate new migrations after schema changes
DATABASE_URL="file:./local.db" npm run db:generate --workspace=packages/database

# Open Drizzle Studio
DATABASE_URL="file:./local.db" npm run db:studio --workspace=packages/database
```

### From the Electron App (App-Specific)

```bash
# Generate migrations (uses electron app's database path)
npm run db:generate --workspace=apps/electron

# Apply migrations
npm run db:migrate --workspace=apps/electron

# Open Drizzle Studio for electron app's database
npm run db:studio --workspace=apps/electron

# Push schema changes directly (development)
npm run db:push --workspace=apps/electron

# Database utilities
npm run db:health --workspace=apps/electron
npm run db:backup --workspace=apps/electron
npm run db:backup --workspace=apps/electron
```

## 🔧 Common Tasks

### Adding a New Package

1. Create a new directory in `packages/`
2. Add a `package.json` with a scoped name: `@yt-dlp-gui/package-name`
3. The package will be automatically included in the workspace

### Adding Dependencies

```bash
# Add to root (dev dependencies for all workspaces)
npm install -D package-name -w root

# Add to specific workspace
npm install package-name --workspace=apps/electron

# Add workspace package to another workspace
npm install @yt-dlp-gui/database --workspace=apps/electron
```

### Cleaning Build Artifacts

```bash
# Clean all build outputs
npm run clean

# Clean specific workspace
npm run clean --workspace=apps/electron
```

## 🏗️ Turborepo

This monorepo uses Turborepo for efficient task orchestration:

- **Caching**: Build outputs are cached for faster rebuilds
- **Parallel Execution**: Tasks run in parallel when possible
- **Dependency-aware**: Automatically builds dependencies first

### Turbo Commands

```bash
# Run a command across all workspaces
turbo run build
turbo run test
turbo run type-check

# Force rebuild (ignore cache)
turbo run build --force

# View task graph
turbo run build --graph
```

## 📝 Code Quality

### Formatting

```bash
# Format all code
npm run format
```

### Project Standards

- **Functional Programming**: Use pure functions, avoid classes
- **TypeScript**: Strict mode enabled, no `any` types
- **Component Size**: Maximum 300 lines per component
- **Single Responsibility**: Each module/component has one clear purpose

See `.github/copilot-instructions.md` for detailed coding standards.

## 🔒 Security

- Database backups are created automatically before migrations
- Environment variables should be stored in `.env` files (not committed)
- Sensitive credentials are managed through secure environment variables

## 📄 License

MIT License - see [LICENSE](apps/electron/LICENSE) for details.

## 👥 Contributing

1. Follow the coding standards in `.github/copilot-instructions.md`
2. Keep components small and focused
3. Write tests for new features
4. Use conventional commits

## 🐛 Troubleshooting

### npm install fails

Try clearing the npm cache and reinstalling:
```bash
npm run clear
npm install
```

### TypeScript errors after adding new package

Run type checking to see detailed errors:
```bash
npm run type-check
```

### Database migration issues

Check database health and create a backup:
```bash
npm run db:health --workspace=apps/electron
npm run db:backup --workspace=apps/electron
```

## 📚 Additional Resources

- [Electron Documentation](https://www.electronjs.org/docs)
- [Turborepo Documentation](https://turbo.build/repo/docs)
- [npm Workspaces](https://docs.npmjs.com/cli/v10/using-npm/workspaces)
- [Drizzle ORM](https://orm.drizzle.team/)
