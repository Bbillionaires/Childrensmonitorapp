# apps/mobile — native scaffold (Milestone 8)

**Status: scaffold, not a working app.** This exists so the native app has a real place to be
built out later, with real current dependency versions and a layout that matches the rest of
the monorepo. Nothing here has been run — this sandboxed environment has no iOS/Android
simulator, no device, and no Metro bundler session, so none of it is verified end-to-end.
Everything below is scoped honestly against that.

## What's real

- A real Expo (`~58.0.21`) + React Native (`0.88.1`) + TypeScript project structure, matching
  what `npx create-expo-app@latest --template blank-typescript` currently generates (checked
  against the npm registry at the time this was written — these are real, current, non-canary
  versions, not placeholders).
- `@app/mobile` is a proper pnpm workspace member (`apps/*` is already in
  `pnpm-workspace.yaml`), and depends on `@app/types` for shared Zod/TypeScript shapes —
  `src/sample-data.ts` is typed as `ContentSummary`, the same type the web app's child library
  uses, so swapping sample data for a real API response later is a data change, not a type
  rewrite.
- `pnpm install` from the repo root resolves this package's dependencies cleanly (verified).
- `pnpm --filter @app/mobile typecheck` is wired up the same way `apps/web`'s is.
- Hand-rolled screen switching (`App.tsx`'s `Screen` union + `setScreen`) instead of a
  navigation library. This is deliberate: every dependency added here is something nobody has
  verified actually works in this environment, so the scaffold stays as small as it can.
- Three UI screens, each explicitly commented as a stub: `LoginScreen`, `LibraryScreen`
  (static 2-column grid, same visual idea as the web app's child library), and `PlayerScreen`
  (a YouTube URL in a `react-native-webview`, the same "embed via official URL, no native SDK"
  approach as the web app's `<iframe>`).

## What's stubbed / not real

- **No backend calls anywhere.** `LoginScreen` does not call `/api/auth/login`. `LibraryScreen`
  renders `src/sample-data.ts`, not a real `/api/child/library` response. `PlayerScreen` embeds
  a fixed sample video and never reports viewing progress.
- **No tests.** There is nothing here that can be exercised without a real device/simulator.

## Known gap: native auth (deliberately not decided here)

The whole web app authenticates with HttpOnly cookies (see
`services/api/src/services/session-cookies.ts`) — the browser sends them automatically on every
request. A React Native app has no browser cookie jar behaving that way by default. Making
native auth real requires an explicit design decision — most likely issuing a bearer/session
token to native clients alongside (not instead of) the existing cookie-based web sessions — and
that's a security-sensitive API surface change that deserves its own discussion, not something
to bolt on silently while "just scaffolding." `LoginScreen` is UI-only specifically because of
this.

## Known gap: Metro + pnpm

`metro.config.js` sets up the standard Expo monorepo pattern (`watchFolders`,
`resolver.nodeModulesPaths`, `disableHierarchicalLookup`, `unstable_enableSymlinks`) so Metro
can see workspace packages through pnpm's symlinked `node_modules`. What's **not** verified:
`@app/types` ships raw TypeScript source directly (`"main": "./src/index.ts"`, no build step) —
fine for Next.js and `tsx`, but Metro's default transform only runs on the app's own source,
not arbitrary TypeScript it finds in `node_modules` (even a symlinked workspace package). This
scaffold has not been run through Metro to confirm `import { ... } from "@app/types"` actually
resolves and transforms correctly. If it doesn't, the two realistic fixes are: (a) give
`@app/types` a real build step (compiled `.js` + `.d.ts`) that `@app/mobile` consumes instead of
the raw source, or (b) extend `metro.config.js`'s transformer config to explicitly include that
one workspace package. Don't assume either is done — check first.

## How to actually run this (needs a real machine, not this sandbox)

```bash
corepack enable
pnpm install                      # from the repo root

cd apps/mobile
npx expo start                    # scan the QR code with Expo Go, or press i/a for a simulator
```

You'll need Xcode (iOS simulator, macOS only) or Android Studio (Android emulator) installed
locally, or the Expo Go app on a physical phone. None of that exists in this environment, which
is why this was never run here.
