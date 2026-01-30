import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

initOpenNextCloudflareForDev();

const nextConfig: NextConfig = {
  output: "standalone",
  reactCompiler: true,
  images: {
    unoptimized: true,
  },
  // Empty turbopack config to silence warning (Turbopack is default in Next.js 16)
  turbopack: {},
};

export default nextConfig;
