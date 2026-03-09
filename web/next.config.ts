import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hide the dev indicator (the bottom-left "N" badge) in development.
  // Ref: https://nextjs.org/docs/app/api-reference/config/next-config-js/devIndicators
  devIndicators: false,

  // Avoid dev-time cross-origin warnings when accessing the dev server via IP.
  // Ref: https://nextjs.org/docs/app/api-reference/config/next-config-js/allowedDevOrigins
  allowedDevOrigins: ["localhost", "127.0.0.1", "172.31.10.127"],
};

export default nextConfig;