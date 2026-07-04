import type { Metadata } from "next";
import "./globals.css";
import { ClientInit } from "@/components/ClientInit";

export const metadata: Metadata = {
  title: "Arondo – AI-Powered Dev from Anywhere",
  description:
    "Delegate software development tasks to AI agents, review PRs on your phone, and ship from anywhere.",
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
