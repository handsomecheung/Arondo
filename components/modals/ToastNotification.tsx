interface Props {
  toast: { message: string; type: "success" | "info" | "error" } | null;
  onClose: () => void;
}

export default function ToastNotification({ toast, onClose }: Props) {
  if (!toast) return null;
  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        background:
          toast.type === "error"
            ? "var(--error)"
            : toast.type === "success"
              ? "#10b981"
              : "var(--bg-elevated)",
        color:
          toast.type === "error" || toast.type === "success"
            ? "#ffffff"
            : "var(--text-primary)",
        border: toast.type === "info" ? "1px solid var(--border)" : "none",
        borderRadius: "var(--radius-md)",
        padding: "12px 20px",
        boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.3), 0 4px 6px -4px rgba(0, 0, 0, 0.3)",
        display: "flex",
        alignItems: "center",
        gap: 12,
        zIndex: 9999,
        maxWidth: "380px",
      }}
    >
      <span style={{ fontSize: 16 }}>
        {toast.type === "success" ? "✅" : toast.type === "error" ? "❌" : "ℹ️"}
      </span>
      <span style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>{toast.message}</span>
      <button
        onClick={onClose}
        style={{
          background: "transparent",
          border: "none",
          color:
            toast.type === "error" || toast.type === "success"
              ? "rgba(255, 255, 255, 0.8)"
              : "var(--text-secondary)",
          cursor: "pointer",
          fontSize: 12,
          padding: 0,
          marginLeft: 8,
          display: "flex",
          alignItems: "center",
        }}
      >
        ✕
      </button>
    </div>
  );
}
