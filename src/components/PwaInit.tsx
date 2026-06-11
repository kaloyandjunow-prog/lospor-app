"use client"
// Registers the generated service worker (built by @ducanh2912/next-pwa at build time).
// Runs once on mount; silently ignored in dev mode (SW is disabled in dev).
import { useEffect } from "react"

export function PwaInit() {
  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch(() => { /* non-critical — app works without SW */ })
    }
  }, [])
  return null
}
