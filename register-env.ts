import { loadEnvConfig } from "@next/env";

// Load environment variables before any other imports are evaluated
loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");
