"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  intraopAttentionItems,
  intraopResolveAttention,
  type IntraopAttentionAction,
  type IntraopAttentionItem,
} from "@lospor/core/intraop-attention"
import { describeIntraopEvent } from "@lospor/core/intraop-summary"
import { localTimeOf } from "@lospor/core/intraop-time"
import { isEmptyIntraopEventOps, type IntraopEventOps } from "@lospor/core/intraop-timetable-edit"
import type { LogEvent } from "@lospor/core/intraop-types"

export type IntraopAttentionEntry = IntraopAttentionItem & { time: string; label: string }

export type WebIntraopAttention = {
  /** Waiting now: unconfirmed stops, and on an ended case what is left after the end. */
  entries: IntraopAttentionEntry[]
  /** What End case would ask if the case ended this minute. */
  endCaseEntries: IntraopAttentionEntry[]
  answer: (key: string, action: IntraopAttentionAction, atEndCase?: boolean) => void
  /** False on a screen watching another screen's case: it shows, and writes nothing. */
  canAnswer: boolean
}

/**
 * The questions the timeline is waiting on, for the web form (9.13.0). The
 * items and what each answer writes are Core's (intraop-attention), exactly as
 * the PWA uses them, so the two cannot list or write differently; the web only
 * adds the time of day, in the case's own zone, and the event's label.
 */
export function useIntraopAttention({ log, endedAt, timeZone, onEventOps, readOnly }: {
  log: LogEvent[]
  endedAt?: string | null
  timeZone?: string | null
  onEventOps?: (ops: IntraopEventOps) => void | Promise<void>
  readOnly?: boolean
}): WebIntraopAttention {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])
  const minute = Math.floor(now / 60_000) * 60_000
  const entries = useMemo(() => decorate(intraopAttentionItems(log, { now: minute, endedAt }), timeZone), [log, minute, endedAt, timeZone])
  const endCaseEntries = useMemo(
    () => decorate(intraopAttentionItems(log, { now: minute, endedAt: endedAt ?? minute }), timeZone),
    [log, minute, endedAt, timeZone],
  )

  const answer = useCallback((key: string, action: IntraopAttentionAction, atEndCase = false) => {
    if (readOnly || !onEventOps) return
    const at = new Date(Math.floor(Date.now() / 60_000) * 60_000)
    const ops = intraopResolveAttention(log, key, action, {
      now: new Date(),
      endedAt: endedAt ?? (atEndCase ? at : null),
    })
    if (!isEmptyIntraopEventOps(ops)) void onEventOps(ops)
  }, [endedAt, log, onEventOps, readOnly])

  return { entries, endCaseEntries, answer, canAnswer: !readOnly && !!onEventOps }
}

function decorate(items: IntraopAttentionItem[], timeZone?: string | null): IntraopAttentionEntry[] {
  return items.map(item => ({
    ...item,
    // The case's zone, never the machine's: a hosted server runs at GMT+1.
    time: (timeZone ? localTimeOf(new Date(item.event.ts), timeZone) : null) ?? "",
    label: describeIntraopEvent(item.event).text,
  }))
}
