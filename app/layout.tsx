import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ClientInit } from "@/components/ClientInit";

export const metadata: Metadata = {
  title: "Arondo – Release from Anywhere, Any Device",
  description:
    "Delegate software development tasks to AI agents, review PRs on your phone, and ship from anywhere.",
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
