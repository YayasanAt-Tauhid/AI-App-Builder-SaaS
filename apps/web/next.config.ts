/**
 * next.config.ts — Next.js configuration.
 *
 * `transpilePackages` lets us import the source-only @aiab/shared workspace
 * package directly (types, model catalog, credit math) without a build step,
 * keeping the client and API perfectly in sync.
 */
import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@aiab/shared"],
  // The Monaco/Sandpack editors are large client-only libs; nothing special
  // is needed here, but we keep React strict mode on for better dev warnings.
  reactStrictMode: true,
};

export default config;
