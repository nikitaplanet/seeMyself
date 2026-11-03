import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // sweph is a native (node-gyp) module: never bundle it, load it with Node's require (spec §2.2).
  serverExternalPackages: ["sweph"],
  // node-gyp-build picks the prebuilt binary at runtime, so file tracing can't see it; ship the
  // prebuilds explicitly or the serverless function (e.g. on Vercel) fails to load sweph.
  outputFileTracingIncludes: {
    "/api/*": ["./node_modules/sweph/prebuilds/**/*", "./node_modules/node-gyp-build/**/*"],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
