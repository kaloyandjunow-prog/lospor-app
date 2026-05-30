"use client"
import { useEffect } from "react"
import { useRouter } from "next/navigation"

export function LiveCaseUpdater({ caseId }: { caseId: string }) {
  const router = useRouter()

  useEffect(() => {
    const es = new EventSource(`/api/cases/${caseId}/stream`)
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        if (data.type !== "connected") {
          window.dispatchEvent(new CustomEvent("case-live-update", { detail: data }))
          router.refresh()
        }
      } catch {}
    }
    return () => es.close()
  }, [caseId, router])

  return null
}
