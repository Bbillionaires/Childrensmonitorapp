# apps/tv — native TV app scaffold (Milestone 9)

**Status: scaffold, not a working app.** Same posture as `apps/mobile`: this exists so a real
native TV app has somewhere to be built out later, with real current dependency versions and a
layout matching the rest of the monorepo. Nothing here has been run — this sandboxed
environment has no Apple TV simulator, no Android TV emulator, and no Metro bundler session, so
none of it is verified end-to-end.

## Why one project covers both Apple TV and Android TV/Fire TV

Unlike `apps/mobile` (iOS + Android from one Expo/React Native codebase), TV platforms don't
share a runtime the way phone OSes mostly do. The real, standard way to target **both** Apple
tvOS and Android TV/Fire TV from one React codebase is
[`react-native-tvos`](https://github.com/react-native-community/react-native-tvos) — a
community-maintained fork of React Native that tracks upstream RN releases closely (this
project pins `0.88.0-0`, matching `apps/mobile`'s RN `0.88.1`) and adds the native TV focus
engine integration (`TVFocusGuideView`, `hasTVPreferredFocus`, and `onFocus`/`onBlur` on
touchables) that a phone build doesn't need. It's installed via npm's package-alias syntax —
`"react-native": "npm:react-native-tvos@0.88.0-0"` in `package.json` — so every normal
`import ... from "react-native"` in the code below actually resolves to the TV fork; this is
the documented way existing `react-native-tvos` projects set this up, not something invented
for this scaffold. `@react-native-tvos/config-tv` (also real, maintained by Expo core
contributors) is the companion Expo config plugin that reconfigures the native Xcode/Gradle
projects for a TV target at `expo prebuild` time, toggled by the `EXPO_TV=1` environment
variable already wired into this package's `start`/`ios`/`android` scripts.

## What's real

- A real, current (checked against the npm registry) Expo `~58.0.21` + `react-native-tvos`
  `0.88.0-0` + `@react-native-tvos/config-tv` `0.1.7` + TypeScript project.
- `@app/tv` is a proper pnpm workspace member depending on `@app/types`, the same shared-types
  pattern as `apps/mobile`.
- `pnpm install` from the repo root resolves this package's dependencies cleanly, and
  `node_modules/react-native` genuinely resolves to the `react-native-tvos` package contents —
  both verified here, along with `pnpm --filter @app/tv typecheck` passing (which only works
  because `hasTVPreferredFocus` and `TVFocusGuideView` type-check against the TV fork's own
  type definitions — the same check against stock `react-native`'s types would fail).
- Hand-rolled screen switching (same reasoning as `apps/mobile`'s `App.tsx`: minimize dependency
  surface nobody here can verify). Three UI-only stub screens (`LoginScreen`, `LibraryScreen`,
  `PlayerScreen`), each using `react-native-tvos`'s real focus-engine primitives
  (`TVFocusGuideView`, `hasTVPreferredFocus`, `onFocus`/`onBlur` focus-ring styling) so a real
  TV remote's D-pad would have something to move between — this mirrors what
  `apps/web/src/app/tv` had to hand-build itself in plain DOM/keyboard terms (see
  `apps/web/src/lib/tv-nav.ts`), except here the platform's own native focus engine does the
  spatial-navigation work instead of a hand-rolled algorithm.

## What's stubbed / not real

- **No backend calls anywhere** — same as `apps/mobile`. `LoginScreen` doesn't call the API;
  `LibraryScreen` renders `src/sample-data.ts`; `PlayerScreen` embeds a fixed sample video.
- **No tests, no actual run.** Nothing here can be exercised without a real Apple TV/Android TV
  device or simulator, none of which exist in this environment.

## Known gap: native auth (same as apps/mobile)

Identical situation to `apps/mobile/README.md`'s "Known gap: native auth" section: the web
app's cookie-based sessions don't translate directly to a native client, and a real design
(most likely bearer tokens issued to native clients alongside the existing cookie sessions)
needs its own explicit decision — not something to bolt on silently while scaffolding.

## Known gap: Metro + pnpm

Same situation as `apps/mobile/README.md`'s equivalent section: `metro.config.js` sets up the
standard Expo monorepo pattern, but whether Metro actually transforms `@app/types`'s raw
TypeScript source from a symlinked workspace package has not been run end-to-end here.

## Deliberately out of scope: Roku

Roku is a real, large share of the smart-TV market, and it is **not** scaffolded here, on
purpose rather than by oversight: Roku channels are built in BrightScript, a proprietary
language with its own runtime (`roCompositor`/`roSGNode`/SceneGraph) that has **zero code
overlap** with this project's TypeScript/React stack — no shared types, no shared UI
components, nothing from `packages/types` or anywhere else in this monorepo carries over.
Scaffolding it honestly would mean writing an entire second, parallel application from scratch
in an unrelated language, which is a real, standalone engineering decision (effort, and whether
Roku's share of this product's target audience justifies it) rather than an extension of the
work done here. If Roku support is wanted, it should be scoped and approved as its own project.

## How to actually run this (needs a real machine, not this sandbox)

```bash
corepack enable
pnpm install                        # from the repo root

cd apps/tv
EXPO_TV=1 npx expo prebuild         # generates ios/ and android/ configured for a TV target
EXPO_TV=1 npx expo run:ios          # needs Xcode + an Apple TV simulator, macOS only
EXPO_TV=1 npx expo run:android      # needs Android Studio + an Android TV emulator image
```

None of Xcode, an Apple TV simulator, Android Studio, or an Android TV emulator exist in this
environment, which is why this was never run here.
