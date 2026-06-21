import type { NextConfig } from "next";

// Read allowed dev origins from env var (comma-separated).
// Example: ALLOWED_DEV_ORIGINS=itero.example.com,localhost:3250
const allowedDevOrigins = process.env.ALLOWED_DEV_ORIGINS
  ? process.env.ALLOWED_DEV_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean)
  : [];

const nextConfig: NextConfig = {
  ...(allowedDevOrigins.length > 0 && { allowedDevOrigins }),
  serverExternalPackages: ["node-pty"],
};

export default nextConfig;
