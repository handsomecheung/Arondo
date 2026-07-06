import type { NextConfig } from "next";

// Read allowed dev origins from env var (comma-separated).
// Example: ALLOWED_DEV_ORIGINS=arondo.example.com,localhost:3250
const allowedDevOrigins = process.env.ALLOWED_DEV_ORIGINS
  ? process.env.ALLOWED_DEV_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean)
  : [];

const nextConfig: NextConfig = {
  distDir: process.env.ARONDO_DIST_DIR || ".next",
  ...(allowedDevOrigins.length > 0 && { allowedDevOrigins }),
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/session/:id", destination: "/" },
        { source: "/project/:id", destination: "/" },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
