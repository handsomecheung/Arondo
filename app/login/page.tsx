"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginContent() {
  const [tokenInput, setTokenInput] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [verifying, setVerifying] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectPath = searchParams ? searchParams.get("redirect") || "/" : "/";

  useEffect(() => {
    // If token already exists and is valid, redirect immediately
    const token = localStorage.getItem("arondo_token");
    if (token) {
      fetch("/api/auth/verify", { headers: { "x-arondo-token": token } })
        .then((res) => {
          if (res.ok) {
            router.push(redirectPath);
          }
        })
        .catch(() => {});
    }
  }, [router, redirectPath]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = tokenInput.trim();
    if (!token) return;

    setVerifying(true);
    setErrorMsg("");

    try {
      const res = await fetch("/api/auth/verify", {
        headers: { "x-arondo-token": token }
      });
      if (res.ok) {
        localStorage.setItem("arondo_token", token);
        router.push(redirectPath);
      } else {
        setErrorMsg("Invalid access token.");
      }
    } catch (err) {
      setErrorMsg("Failed to connect to server.");
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "100vh",
      background: "radial-gradient(circle at top, #18181b 0%, #09090b 100%)",
      fontFamily: "sans-serif",
      color: "#fff",
      padding: 20,
    }}>
      <div style={{
        backgroundColor: "rgba(30, 30, 30, 0.75)",
        backdropFilter: "blur(12px)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        borderRadius: "16px",
        padding: "40px 32px",
        width: "100%",
        maxWidth: "400px",
        boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.4)",
        textAlign: "center",
      }}>
        <div style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 56,
          height: 56,
          borderRadius: 12,
          background: "linear-gradient(135deg, #3b82f6, #1d4ed8)",
          boxShadow: "0 0 20px rgba(59, 130, 246, 0.4)",
          fontSize: 24,
          marginBottom: 20,
        }}>
          🔑
        </div>
        <h1 style={{
          fontSize: 24,
          fontWeight: 700,
          marginBottom: 8,
          letterSpacing: "-0.025em",
          color: "#fff",
        }}>
          Arondo
        </h1>
        <p style={{
          fontSize: 14,
          color: "#a1a1aa",
          marginBottom: 16,
        }}>
          Enter access token to unlock workspace
        </p>
        <p style={{
          fontSize: 12,
          color: "#71717a",
          lineHeight: "1.4",
          marginBottom: 32,
          padding: "8px 12px",
          background: "rgba(0, 0, 0, 0.15)",
          borderRadius: "8px",
          border: "1px solid rgba(255, 255, 255, 0.04)",
          textAlign: "left"
        }}>
          💡 You can find the generated token in the server console logs on startup, or configure them in <code>~/.arondo/tokens.json</code>.
        </p>

        <form onSubmit={handleSubmit} style={{ textAlign: "left" }}>
          <div style={{ marginBottom: 20 }}>
            <label style={{
              display: "block",
              fontSize: 12,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "#a1a1aa",
              marginBottom: 8,
            }}>
              Access Token
            </label>
            <input
              type="password"
              placeholder="Enter token"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              disabled={verifying}
              style={{
                width: "100%",
                padding: "12px 16px",
                backgroundColor: "rgba(0, 0, 0, 0.2)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: "8px",
                color: "#fff",
                fontSize: 15,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          {errorMsg && (
            <div style={{
              backgroundColor: "rgba(239, 68, 68, 0.1)",
              border: "1px solid rgba(239, 68, 68, 0.2)",
              borderRadius: "8px",
              padding: "10px 14px",
              color: "#ef4444",
              fontSize: 13,
              marginBottom: 20,
            }}>
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={verifying}
            style={{
              width: "100%",
              padding: "12px",
              backgroundColor: verifying ? "#1d4ed8" : "#3b82f6",
              border: "none",
              borderRadius: "8px",
              color: "#fff",
              fontWeight: 600,
              fontSize: 15,
              cursor: verifying ? "not-allowed" : "pointer",
              boxShadow: "0 4px 6px -1px rgba(59, 130, 246, 0.2)",
            }}
          >
            {verifying ? "Verifying..." : "Verify & Continue"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <LoginContent />
    </Suspense>
  );
}
