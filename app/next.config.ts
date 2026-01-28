import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  images: {
    unoptimized: true,
  },
  // Empty turbopack config to silence warning (Turbopack is default in Next.js 16)
  turbopack: {},
};

export default nextConfig;
