"use client"

import { useState } from "react"
import { Share2, Check } from "lucide-react"

export function ShareCaseButton({
  caseId,
  className,
}: {
  caseId: string
  className?: string
}) {
  const [copied, setCopied] = useState(false)

  async function handleClick(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    await navigator.clipboard.writeText(`${window.location.origin}/cases/${caseId}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      title={copied ? "Link copied!" : "Copy share link"}
      className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-md border transition-colors ${
        copied
          ? "border-green-300 dark:border-green-700 text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20"
          : "border-slate-200 dark:border-[#3a3a3a] text-slate-400 dark:text-slate-500 hover:border-blue-300 dark:hover:border-blue-700/50 hover:text-blue-500 dark:hover:text-blue-400"
      } ${className ?? ""}`}
    >
      {copied
        ? <Check className="h-3.5 w-3.5" />
        : <Share2 className="h-3.5 w-3.5" />
      }
      {copied ? "Copied!" : "Share"}
    </button>
  )
}
