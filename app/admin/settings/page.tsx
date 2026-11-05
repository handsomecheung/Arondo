import Link from "next/link";
import { adminSettingsSections } from "./sections";

export default function AdminSettingsPage() {
  return (
    <nav
      aria-label="Admin settings sections"
      style={{ display: "flex", flexDirection: "column", gap: 12 }}
    >
      {adminSettingsSections.map(({ slug, title, description }) => (
        <Link
          key={slug}
          href={"/admin/settings/" + slug}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            padding: 16,
            background: "var(--bg-surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            textDecoration: "none",
            color: "var(--text-primary)",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
              {title}
            </h2>
            <p
              style={{
                fontSize: 13,
                color: "var(--text-muted)",
                lineHeight: 1.5,
              }}
            >
              {description}
            </p>
          </div>
          <span aria-hidden="true">→</span>
        </Link>
      ))}
    </nav>
  );
}
