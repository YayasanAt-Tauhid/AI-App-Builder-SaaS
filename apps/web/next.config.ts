import type { NextConfig } from "next";
import path from "path";

const config: NextConfig = {
  transpilePackages: ["@aiab/shared"],
  reactStrictMode: true,
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  turbopack: {
    root: path.resolve(__dirname, "../.."),
  },
};

export default config;
