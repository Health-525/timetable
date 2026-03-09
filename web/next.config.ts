import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hide the dev indicator (the bottom-left "N" badge) in development.
  // Ref: https://nextjs.org/docs/app/api-reference/config/next-config-js/devIndicators
  devIndicators: false,
};

export default nextConfig;