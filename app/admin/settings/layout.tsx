"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { IconLogo, IconRefresh } from "@/components/Icons";
import GeneratedTokensProvider from "@/components/admin/GeneratedTokensProvider";
import { adminSettingsSections } from "./sections";
function IconArrowLeft() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  );
}

export default function AdminSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const section = adminSettingsSections.find(
    (section) => pathname === "/admin/settings/" + section.slug,
  );
  const [isAdmin, setIsAdmin] = useState(false);
  const [serverVersion, setServerVersion] = useState("");
  useEffect(() => {
    fetch("/api/auth/verify")
      .then((r) => r.json())
      .then((data) => {
        if (data.valid && data.role === "admin") setIsAdmin(true);
        else router.replace("/");
      })
      .catch((err) => {
        console.error(err);
        router.replace("/");
      });
  }, [router]);
  useEffect(() => {
    if (!isAdmin) return;
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        if (data.version) setServerVersion(data.version);
      })
      .catch(console.error);
  }, [isAdmin]);
  if (!isAdmin) return null;
  return (
    <GeneratedTokensProvider>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100dvh",
          overflow: "hidden",
          background: "var(--bg-base)",
        }}
      >
        <header className="header">
          <Link
            href={section ? "/admin/settings" : "/"}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 36,
              height: 36,
              borderRadius: "var(--radius-sm)",
              background: "transparent",
              border: "1px solid var(--border)",
              color: "var(--text-secondary)",
              cursor: "pointer",
              textDecoration: "none",
              flexShrink: 0,
              transition: "all 0.2s ease",
            }}
            title={section ? "Back to Admin Settings" : "Back to dashboard"}
            aria-label={
              section ? "Back to Admin Settings" : "Back to dashboard"
            }
          >
            <IconArrowLeft />
          </Link>

          <div className="header-logo">
            <IconLogo />
            <span className="header-title">Arondo</span>
          </div>
          <span
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "var(--text-secondary)",
            }}
          >
            Admin Settings
          </span>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-secondary)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 4,
              borderRadius: "var(--radius-sm)",
              transition: "all 0.2s ease",
              marginLeft: "auto",
            }}
            title="Refresh App"
            aria-label="Refresh application data"
            onMouseEnter={(e) =>
              (e.currentTarget.style.color = "var(--text-primary)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.color = "var(--text-secondary)")
            }
          >
            <IconRefresh />
          </button>
        </header>

        <main
          style={{
            flex: 1,
            overflowY: "auto",
            padding: 24,
          }}
        >
          <div
            style={{
              maxWidth: 720,
              margin: "0 auto",
              display: "flex",
              flexDirection: "column",
              gap: 24,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-end",
                flexWrap: "wrap",
                gap: 12,
              }}
            >
              <div>
                <h1
                  style={{
                    fontSize: 22,
                    fontWeight: 700,
                    color: "var(--text-primary)",
                    letterSpacing: "-0.02em",
                    marginBottom: 4,
                  }}
                >
                  {section?.title ?? "Admin Settings"}
                </h1>
                <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
                  {section?.description ??
                    "Manage your Arondo configuration and administrative settings."}
                </p>
              </div>
              {serverVersion && (
                <span
                  style={{
                    fontSize: 12,
                    color: "var(--text-muted)",
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border)",
                    padding: "4px 8px",
                    borderRadius: "var(--radius-sm)",
                    fontFamily: "monospace",
                  }}
                >
                  Server v{serverVersion}
                </span>
              )}
            </div>

            {children}
          </div>
        </main>
      </div>
    </GeneratedTokensProvider>
  );
}
