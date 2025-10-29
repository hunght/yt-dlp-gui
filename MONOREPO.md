# Monorepo Quick Reference

## 📁 Structure Overview

```
root/
├── apps/electron/           # Main Electron app (@yt-dlp-gui/electron)
├── packages/database/       # Shared database schema (@yt-dlp-gui/database)
├── packages/tsconfig/       # Shared TypeScript configs (@yt-dlp-gui/tsconfig)
└── package.json            # Root workspace config
```

## 🚀 Quick Commands

### Development
```bash
npm run dev                          # Start Electron app
npm run dev --workspace=apps/electron # Same as above
```

### Building
```bash
npm run build                        # Build all packages
npm run build -w packages/database   # Build database package only
```

### Testing
```bash
npm test                             # Run all tests
npm run test:watch                   # Watch mode
npm run test:database -w apps/electron # Database tests only
```

### Database
```bash
npm run db:studio                    # Open Drizzle Studio
npm run db:generate                  # Generate migrations
npm run db:migrate                   # Apply migrations
npm run db:push                      # Push schema changes
```

### Workspace Management
```bash
# Install dependency to specific workspace
npm install <package> --workspace=apps/electron
npm install <package> -w packages/database

# Install dev dependency to root
npm install -D <package> -w root

# Link workspace packages
npm install @yt-dlp-gui/database -w apps/electron
```

## 🎯 Common Workflows

### Adding a New Feature to Electron App
```bash
cd apps/electron
# Add your feature files
npm run type-check                   # Check types
npm run test                         # Run tests
npm run dev                          # Test in dev mode
```

### Updating Database Schema
```bash
# 1. Edit packages/database/src/schema.ts
# 2. Generate migration
npm run db:generate -w apps/electron

# 3. Apply migration
npm run db:migrate -w apps/electron

# 4. Verify
npm run db:studio
```

### Creating a New Package
```bash
# 1. Create directory
mkdir packages/my-package

# 2. Create package.json
cat > packages/my-package/package.json << 'EOF'
{
  "name": "@yt-dlp-gui/my-package",
  "version": "1.0.0",
  "private": true
}
EOF

# 3. Install dependencies (from root)
npm install
```

## 🔍 Troubleshooting

### "Cannot find module @yt-dlp-gui/..."
```bash
npm install                          # Reinstall dependencies
npm run build -w packages/database   # Build the package
```

### TypeScript Errors
```bash
npm run type-check                   # Check all workspaces
npm run type-check -w apps/electron  # Check specific workspace
```

### Clean Build
```bash
npm run clean                        # Clean all workspaces
rm -rf node_modules                  # Nuclear option
npm install                          # Reinstall everything
```

## 📦 Workspace Specifics

### @yt-dlp-gui/electron
- **Purpose**: Main Electron application
- **Key Files**:
  - `src/main.ts` - Electron main process
  - `src/renderer.ts` - React renderer entry
  - `drizzle.config.ts` - Database config

### @yt-dlp-gui/database
- **Purpose**: Shared database schema and types
- **Exports**:
  - Default: All schema exports
  - `/schema`: Database schema specifically
- **Build**: Uses `tsup` to create ESM/CJS bundles

### @yt-dlp-gui/tsconfig
- **Purpose**: Shared TypeScript configurations
- **Configs**:
  - `base.json` - Base config
  - `react.json` - React-specific
  - `electron.json` - Electron-specific

## 🎨 Best Practices

1. **Always run commands from root** unless specifically working in one workspace
2. **Build packages before using them** in other workspaces
3. **Use workspace protocol** (`*`) for internal dependencies
4. **Run type-check before commits** to catch errors early
5. **Keep packages independent** - minimize cross-dependencies

## 🔗 Useful Links

- [npm Workspaces Docs](https://docs.npmjs.com/cli/v10/using-npm/workspaces)
- [Turborepo Docs](https://turbo.build/repo/docs)
- [Electron Forge Docs](https://www.electronforge.io/)
