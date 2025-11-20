# Auto-Update System Documentation

## Overview

LearnifyTube now mirrors the iTracksy auto-update stack by using the [update-electron-app](https://github.com/electron/update-electron-app) helper in combination with Electron Forge's GitHub publisher. Updates are distributed via [update.electronjs.org](https://update.electronjs.org), which proxies the public GitHub releases for the `hunght/LearnifyTube` repository.

## How It Works

```
LearnifyTube → update-electron-app (every 24h) → update.electronjs.org → GitHub Releases
```

- **Development**: auto-update is skipped (development builds stay local).
- **Production**: checks for a newer version once per day, downloads silently, and applies on restart.

## Dependencies

```json
"dependencies": {
  "update-electron-app": "^3.1.1",
  "electron-log": "^5.4.3"
}
```

## Configuration Checklist

1. **Repository** – `package.json` includes the GitHub repository metadata (`hunght/LearnifyTube`).
2. **GitHub Publisher** – `forge.config.ts` registers `PublisherGithub` with the same owner/repo so releases land where update.electronjs.org expects them.
3. **External Dependency** – `update-electron-app` is listed inside `EXTERNAL_DEPENDENCIES` to guarantee it is bundled in production builds.
4. **Main Process** – `src/main.ts` imports `updateElectronApp` and calls `initializeAutoUpdate()` inside `app.whenReady()`.

## Usage

```ts
// src/main.ts
import { updateElectronApp } from "update-electron-app";

function initializeAutoUpdate() {
  if (process.env.NODE_ENV === "development" || !app.isPackaged) {
    logger.info("[auto-update] Skipping auto-update initialization in development mode");
    return;
  }

  updateElectronApp();
  logger.info("[auto-update] Auto-update initialized; updates will be checked automatically");
}

app.whenReady().then(() => {
  initializeAutoUpdate();
  // ... rest of boot flow
});
```

## Testing the Setup

Run the validation script:

```bash
npm run test:auto-update
```

You should see the checklist output confirming:

- `update-electron-app` and `electron-log` are installed.
- `package.json` repository metadata exists.
- `forge.config.ts` includes the GitHub publisher targeting `hunght/LearnifyTube`.
- Main-process code has the auto-update hook.

## Release Workflow

1. Run `npm run release [major|minor|patch|x.y.z] [--draft|--prerelease]`.
   This bumps the version, records the release intent in the git tag, and pushes `main` + `v*` tag.
2. GitHub Actions builds notarized macOS, Windows, and Linux artifacts and publishes them to the GitHub release.
   Pass `--draft` (optionally `--prerelease`) to keep the release unpublished until you review it.
3. Auto-update clients detect the new published release on the next app start and download it in the background.

## Troubleshooting

- **Updates don't download** – ensure the release artifacts follow the LearnifyTube naming pattern (`LearnifyTube-<platform>-<arch>-<version>.zip`), and that they are published (not drafts).
- **macOS blocks install** – confirm the build was signed and notarized; auto-update binaries must be trusted.
- **Still on old version** – inspect `~/Library/Logs/LearnifyTube/main.log` (macOS) or `%APPDATA%/LearnifyTube/logs/main.log` (Windows) for `[auto-update]` logs and `update-electron-app` diagnostics.

## Resources

- [update-electron-app README](https://github.com/electron/update-electron-app)
- [Electron Forge auto-update docs](https://www.electronforge.io/advanced/auto-update)
- [update.electronjs.org documentation](https://update.electronjs.org)

With this configuration LearnifyTube receives the same hardened auto-update flow as iTracksy, ensuring every production build can be delivered seamlessly to end users.

