import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ClientInit } from "@/components/ClientInit";

export const metadata: Metadata = {
  title: process.env.ARONDO_TITLE ?? "Arondo",
  description:
    "Delegate software development tasks to AI agents, review PRs on your phone, and ship from anywhere.",
  icons: {
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ClientInit />
        {children}
      </body>
    </html>
  );
}
