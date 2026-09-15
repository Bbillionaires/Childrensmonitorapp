/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @app/types is consumed as TypeScript source (a workspace package, not a published
  // build) — Next must transpile it itself rather than expecting compiled JS in
  // node_modules.
  transpilePackages: ["@app/types"],
  webpack: (config) => {
    // Our packages use NodeNext-style relative imports (e.g. "./auth.js") that point at
    // ".ts" source files, per TypeScript's ESM convention — webpack needs to know a ".js"
    // specifier may resolve to a ".ts" file for these workspace packages.
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};

export default nextConfig;
