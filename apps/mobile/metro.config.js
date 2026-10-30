const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Standard Expo monorepo setup so Metro can see pnpm-workspace packages (e.g. @app/types)
// that live outside apps/mobile. UNVERIFIED in this environment — no device/simulator is
// available here to actually run Metro. See README.md's "Known gap: Metro + pnpm" section
// before relying on this; @app/types ships raw .ts source with no build step, and Metro may
// need further config (or a build step for @app/types) to transform it from node_modules.
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
config.resolver.disableHierarchicalLookup = true;
config.resolver.unstable_enableSymlinks = true;

module.exports = config;
