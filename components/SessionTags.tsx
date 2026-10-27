import type { CSSProperties } from "react";
import type { Session } from "@/types/home";

const tagStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  flexShrink: 0,
  fontSize: 10,
  fontWeight: 600,
  lineHeight: "16px",
  padding: "0 5px",
  border: "1px solid currentColor",
  borderRadius: 4,
  whiteSpace: "nowrap",
};

export default function SessionTags({ session }: { session: Pick<Session, "automation" | "once"> }) {
  return (
    <>
      {session.automation && (
        <span title="Automation session" style={{ ...tagStyle, color: "var(--accent)", background: "var(--accent-glow)" }}>
          Automation
        </span>
      )}
      {session.once && (
        <span title="Single-use session: accepts only one message" style={{ ...tagStyle, color: "var(--warning)", background: "var(--warning-bg)" }}>
          Once
        </span>
      )}
    </>
  );
}
