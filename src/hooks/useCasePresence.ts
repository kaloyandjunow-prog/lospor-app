"use client"

import { useEffect, useState } from "react"
import { CASE_PRESENCE_HEARTBEAT_MS, type CasePresence } from "@lospor/core/case-presence"
import { getDeviceId } from "./useCaseLock"

/**
 * Who has this case open (10.8.0): the screen reports itself while the case is open and is told who else
 * is in it. A notice only -- several people work in one case and the last edit wins.
 */
export function useCasePresence(caseId: string | null, enabled = true): CasePresence | null {
  const [presence, setPresence] = useState<CasePresence | null>(null)

  useEffect(() => {
    if (!caseId || !enabled) return
    const deviceId = getDeviceId()
    const url = `/api/cases/${caseId}/presence`
    const send = (method: "POST" | "DELETE") => fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId }),
      keepalive: method === "DELETE",
    })
    let stopped = false
    const report = async () => {
      try {
        const response = await send("POST")
        if (!response.ok || stopped) return
        setPresence(await response.json() as CasePresence)
      } catch { /* offline: the last answer stays until the next report */ }
    }
    void report()
    const timer = setInterval(() => { void report() }, CASE_PRESENCE_HEARTBEAT_MS)
    const leave = () => { void send("DELETE").catch(() => {}) }
    // Closing the tab or leaving the page does not unmount the hook: leave then too, or the others hear of it a minute late.
    window.addEventListener("pagehide", leave)
    return () => {
      stopped = true
      clearInterval(timer)
      window.removeEventListener("pagehide", leave)
      leave()
    }
  }, [caseId, enabled])

  return presence
}
