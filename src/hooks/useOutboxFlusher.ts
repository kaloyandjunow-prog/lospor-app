"use client"

// Replays the offline save tray (src/lib/case-outbox.ts): once on mount
// (with a crash-recovery reconcile), then on reconnect, tab focus, and a
// 15-second interval — mirroring mobile's use-queued-save-flusher.
import { useEffect, useRef } from "react"
import { caseOutbox } from "@/lib/case-outbox"

export function useOutboxFlusher(onFlushed?: (result: { saved: number; failed: number; discarded: number }) => void) {
  const onFlushedRef = useRef(onFlushed)
  useEffect(() => { onFlushedRef.current = onFlushed }, [onFlushed])

  useEffect(() => {
    let cancelled = false
    let flushing = false
    let reconciled = false

    const flush = async () => {
      if (cancelled || flushing) return
      flushing = true
      try {
        if (!reconciled) {
          reconciled = true
          await caseOutbox.reconcile()
        }
        const result = await caseOutbox.flushAll()
        if (!cancelled && (result.saved > 0 || result.discarded > 0)) onFlushedRef.current?.(result)
      } catch {
        /* flush is best-effort; the next trigger retries */
      } finally {
        flushing = false
      }
    }

    void flush()
    const timer = setInterval(flush, 15_000)
    window.addEventListener("online", flush)
    window.addEventListener("focus", flush)
    return () => {
      cancelled = true
      clearInterval(timer)
      window.removeEventListener("online", flush)
      window.removeEventListener("focus", flush)
    }
  }, [])
}
