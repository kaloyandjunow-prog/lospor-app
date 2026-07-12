"use client"

// Global "saves waiting to sync" indicator in the app header. Visible on
// every page whenever the offline tray holds queued saves; disappears the
// moment they drain. Also hosts the app's single outbox flusher mount.
import { useEffect, useState } from "react"
import { CloudOff } from "lucide-react"
import { useTranslations } from "next-intl"
import { caseOutbox, onOutboxChange } from "@/lib/case-outbox"
import { useOutboxFlusher } from "@/hooks/useOutboxFlusher"

export function OutboxBadge() {
  const t = useTranslations()
  const [count, setCount] = useState(0)

  // The one app-wide flusher: replays the tray on reconnect/focus/backoff rhythm.
  useOutboxFlusher()

  useEffect(() => {
    let mounted = true
    caseOutbox.summary().then((s) => { if (mounted) setCount(s.count) }).catch(() => {})
    const unsubscribe = onOutboxChange((s) => setCount(s.count))
    return () => { mounted = false; unsubscribe() }
  }, [])

  if (count === 0) return null
  return (
    <span
      title={t("nav.queuedSavesTitle")}
      className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/30 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300"
    >
      <CloudOff className="h-3.5 w-3.5" />
      {t("nav.queuedSaves", { count })}
    </span>
  )
}
