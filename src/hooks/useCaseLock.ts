"use client"
import { useEffect, useRef, useState } from "react"

export type LockState = "idle" | "acquiring" | "held" | "watching"

function getDeviceId(): string {
  if (typeof window === "undefined") return ""
  let id = localStorage.getItem("lospor_device_id")
  if (!id) {
    id = typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, "0")).join("")
    localStorage.setItem("lospor_device_id", id)
  }
  return id
}

export function useCaseLock(caseId: string | null, enabled = true): {
  lockState: LockState
  isWatching: boolean
  holderName: string | null
  takeover: () => Promise<void>
} {
  const [lockState, setLockState] = useState<LockState>("idle")
  const [holderName, setHolderName] = useState<string | null>(null)
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const deviceIdRef  = useRef("")
  const caseIdRef    = useRef(caseId)
  useEffect(() => { caseIdRef.current = caseId }, [caseId])

  useEffect(() => {
    if (!caseId || !enabled) { setLockState("idle"); return }

    const deviceId = getDeviceId()
    deviceIdRef.current = deviceId
    setLockState("acquiring")

    async function acquire(force = false): Promise<boolean> {
      try {
        const res = await fetch(`/api/cases/${caseId}/lock`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceId, force }),
        })
        if (res.status === 409) {
          const body = await res.json().catch(() => ({}))
          setHolderName(body.holderName ?? null)
          setLockState("watching")
          return false
        }
        setHolderName(null)
        setLockState("held")
        return true
      } catch {
        setLockState("held") // fail open — never block editing on network error
        return true
      }
    }

    acquire().then(held => {
      if (!held) return
      heartbeatRef.current = setInterval(async () => {
        try {
          const r = await fetch(`/api/cases/${caseIdRef.current}/lock`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ deviceId }),
          })
          if (r.status === 409) {
            const body = await r.json().catch(() => ({}))
            setHolderName(body.holderName ?? null)
            setLockState("watching")
          }
        } catch {}
      }, 15_000)
    })

    function release() {
      if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null }
      const id = caseIdRef.current
      const did = deviceIdRef.current
      if (id && did) {
        fetch(`/api/cases/${id}/lock`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceId: did }),
          keepalive: true,
        }).catch(() => {})
      }
    }

    window.addEventListener("beforeunload", release)
    return () => {
      window.removeEventListener("beforeunload", release)
      release()
    }
  }, [caseId, enabled])

  async function takeover() {
    const deviceId = deviceIdRef.current
    if (!caseId || !deviceId) return
    try {
      // Force-delete the existing lock then reacquire
      await fetch(`/api/cases/${caseId}/lock`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: "__takeover__" }),
      })
      const res = await fetch(`/api/cases/${caseId}/lock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId, force: true }),
      })
      if (res.ok) {
        setHolderName(null)
        setLockState("held")
        heartbeatRef.current = setInterval(async () => {
          try {
            const r = await fetch(`/api/cases/${caseId}/lock`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ deviceId }),
            })
            if (r.status === 409) {
              const body = await r.json().catch(() => ({}))
              setHolderName(body.holderName ?? null)
              setLockState("watching")
            }
          } catch {}
        }, 15_000)
      }
    } catch {}
  }

  return { lockState, isWatching: lockState === "watching", holderName, takeover }
}
