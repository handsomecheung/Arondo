import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Itero – AI-Powered Dev from Anywhere",
  description:
    "Delegate software development tasks to AI agents, review PRs on your phone, and ship from anywhere.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
