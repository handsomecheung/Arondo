"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

export function ClientInit() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    // 1. Monkey-patch window.fetch
    if (typeof window !== "undefined") {
      const originalFetch = window.fetch;
      window.fetch = async function (input, init) {
        const token = localStorage.getItem("arondo_token");
        if (token) {
          init = init || {};
          init.headers = init.headers || {};
          if (init.headers instanceof Headers) {
            init.headers.set("x-arondo-token", token);
          } else if (Array.isArray(init.headers)) {
            const hasHeader = init.headers.some(([key]) => key.toLowerCase() === "x-arondo-token");
            if (!hasHeader) {
              init.headers.push(["x-arondo-token", token]);
            }
          } else {
            const headers = init.headers as Record<string, string>;
            if (!headers["x-arondo-token"] && !headers["X-Arondo-Token"]) {
              headers["x-arondo-token"] = token;
            }
          }
        }
        return originalFetch(input, init);
      };
    }

    // 2. Register service worker (required by Chrome on Android for full PWA installability)
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.error("Service worker registration failed:", err);
      });
    }

    // 3. Perform authentication check
    if (pathname === "/login") {
      return; // Do not check auth on the login page itself
    }

    const checkToken = async () => {
      const storedToken = localStorage.getItem("arondo_token");
      if (!storedToken) {
        // Redirect to login page immediately, passing current path as redirect query
        const redirectParam = encodeURIComponent(pathname || "/");
        router.push(`/login?redirect=${redirectParam}`);
        return;
      }

      try {
        const res = await fetch("/api/auth/verify");
        if (!res.ok) {
          localStorage.removeItem("arondo_token");
          const redirectParam = encodeURIComponent(pathname || "/");
          router.push(`/login?redirect=${redirectParam}`);
        }
      } catch (err) {
        console.error("Failed to verify token:", err);
      }
    };

    checkToken();

    // 4. Global keyboard reload shortcut for PWA/Standalone app
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === "F5" ||
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "r")
      ) {
        e.preventDefault();
        window.location.reload();
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [pathname, router]);

  return null;
}
