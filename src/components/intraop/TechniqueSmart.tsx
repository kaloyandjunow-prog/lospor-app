"use client"

import { useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import {
  TECHNIQUE_SIDES, plannedTechniquesLeft, searchTechniques, setTechniqueSide, techniqueAncestors, techniqueHasSide, techniqueSidesFor,
  type TechniqueSide,
} from "@lospor/core/technique-smart"
import { displayClinicalCode } from "@/lib/clinical-display"
import type { TechniqueNode } from "@/components/TechniqueTree"

const SIDE_KEY = { LEFT: "left", RIGHT: "right", BOTH: "both" } as const

const leavesOf = (node: TechniqueNode): TechniqueNode[] => (node.children?.length ? node.children.flatMap(leavesOf) : [node])

/**
 * The Technique section, Smart selection (10.2.0): what is in use (with the side of a block), the preop plan in
 * one tap, a search across every technique, the clinician's usual ones, and the full list opening in place. Finding,
 * sides and the usual list are Core's (technique-smart); the saved data is still the list of technique codes, with
 * the side beside it by code.
 */
export function TechniqueSmart({ techniques, sides, onChange, tree, planned, recents }: {
  techniques: readonly string[]
  sides: Record<string, TechniqueSide>
  /** The new list and sides; the caller saves both together and remembers what was added. */
  onChange: (techniques: string[], sides: Record<string, TechniqueSide>, added: string[]) => void
  tree: readonly TechniqueNode[]
  /** Techniques planned at the preop visit. */
  planned: readonly string[]
  recents: readonly string[]
}) {
  const t = useTranslations("intraop.techniqueSmart")
  const locale = useLocale()
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [otherText, setOtherText] = useState("")
  const label = (code: string) => displayClinicalCode("option:TECHNIQUE", code, locale)
  const nameOf = (code: string) => (code.startsWith("OTHER:") ? code.slice(6) : label(code))
  const path = (code: string) => techniqueAncestors(code).map(label).join(" › ")

  function toggle(code: string) {
    const on = techniques.includes(code)
    const next = on ? techniques.filter(item => item !== code) : [...techniques, code]
    onChange(next, techniqueSidesFor(next, sides), on ? [] : [code])
  }
  function usePlan() {
    const left = plannedTechniquesLeft(planned, techniques)
    if (left.length > 0) onChange([...techniques, ...left], sides, left)
  }
  function pickSide(code: string, side: TechniqueSide) {
    onChange([...techniques], setTechniqueSide(sides, code, sides[code] === side ? null : side), [])
  }
  function addOther() {
    const text = otherText.trim()
    if (!text) return
    const code = `OTHER:${text}`
    if (!techniques.includes(code)) onChange([...techniques, code], sides, [])
    setOtherText("")
  }

  const hits = searchTechniques(query, 6, code => [label(code)])
  const planLeft = plannedTechniquesLeft(planned, techniques)
  const eyebrow = "mt-4 mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400"

  const renderNode = (node: TechniqueNode) => {
    if (node.v === "OTHER") return null
    if (!node.children?.length) {
      const on = techniques.includes(node.v)
      return (
        <button key={node.v} type="button" aria-pressed={on} data-testid={`technique-leaf-${node.v}`} onClick={() => toggle(node.v)}
          className={`my-1 flex min-h-11 w-full items-center gap-2.5 rounded-xl border px-3 text-left text-sm ${on ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30" : "border-slate-200 dark:border-[#333]"}`}>
          <span className={`grid h-5 w-5 place-items-center rounded-full border-2 text-xs font-bold ${on ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300"}`}>{on ? "✓" : ""}</span>
          {label(node.v)}
        </button>
      )
    }
    const isOpen = !!open[node.v]
    const count = leavesOf(node).filter(leaf => techniques.includes(leaf.v)).length
    return (
      <div key={node.v}>
        <button type="button" data-testid={`technique-node-${node.v}`} onClick={() => setOpen(current => ({ ...current, [node.v]: !isOpen }))} className="flex min-h-11 w-full items-center gap-2 text-left text-sm font-semibold">
          <span className="text-slate-400">{isOpen ? "▾" : "▸"}</span>
          <span className="flex-1">{label(node.v)}</span>
          <span className="text-xs font-normal text-slate-500">{count > 0 ? `${t("selectedCount", { count })} · ` : ""}{leavesOf(node).length}</span>
        </button>
        {isOpen ? <div className="border-l-2 border-slate-200 pl-2.5 dark:border-[#333]">{node.children.map(renderNode)}</div> : null}
      </div>
    )
  }

  return (
    <div data-testid="technique-smart">
      <p className={`${eyebrow} !mt-0`}>{t("inUse")}{techniques.length > 0 ? ` · ${techniques.length}` : ""}</p>
      {techniques.length === 0 ? (
        <p data-testid="technique-empty" className="text-sm text-slate-500">{t("nothing")}</p>
      ) : (
        <div className="space-y-2">
          {techniques.map(code => (
            <div key={code} data-testid={`technique-chip-${code}`} className="rounded-xl border border-emerald-500/40 bg-emerald-50/60 p-2 dark:bg-emerald-950/20">
              <button type="button" data-testid={`technique-remove-${code}`} aria-label={nameOf(code)} onClick={() => toggle(code)} className="flex min-h-9 w-full items-center gap-2 text-left">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold">{nameOf(code)}</span>
                  {!code.startsWith("OTHER:") && path(code) ? <span className="block text-[11px] text-slate-500">{path(code)}</span> : null}
                </span>
                <span className="text-lg text-slate-400">×</span>
              </button>
              {techniqueHasSide(code) ? (
                <div className="mt-1.5 flex items-center gap-1.5">
                  <span className={`w-14 text-[11px] font-bold ${sides[code] ? "text-slate-500" : "text-amber-600 dark:text-amber-400"}`}>{sides[code] ? t("side") : t("sideNeeded")}</span>
                  {TECHNIQUE_SIDES.map(side => (
                    <button key={side} type="button" aria-pressed={sides[code] === side} data-testid={`technique-side-${code}-${side}`} onClick={() => pickSide(code, side)}
                      className={`min-h-11 flex-1 rounded-lg border text-sm font-semibold ${sides[code] === side ? "border-violet-500 bg-violet-50 text-violet-700 dark:bg-violet-950/30 dark:text-violet-300" : "border-slate-300 dark:border-[#444]"}`}>{t(SIDE_KEY[side])}</button>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {planLeft.length > 0 ? (
        <>
          <p className={eyebrow}>{t("plan")}</p>
          <div data-testid="technique-plan" className="flex items-center gap-3 rounded-xl border border-dashed border-amber-500 bg-amber-50 p-2.5 dark:bg-amber-950/20">
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-bold text-amber-700 dark:text-amber-400">{t("planned")}</span>
              <span className="block text-sm font-bold">{planLeft.map(nameOf).join(" + ")}</span>
            </span>
            <button type="button" data-testid="technique-use-plan" onClick={usePlan} className="min-h-11 rounded-xl border border-violet-500 bg-violet-50 px-4 text-sm font-bold text-violet-700 dark:bg-violet-950/30 dark:text-violet-300">{t("usePlan")}</button>
          </div>
        </>
      ) : null}

      <p className={eyebrow}>{t("find")}</p>
      <input data-testid="technique-search" value={query} onChange={event => setQuery(event.target.value)} placeholder={t("searchHint")}
        className="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm dark:border-[#444] dark:bg-[#141414]" />
      {query.trim() ? (
        <div className="mt-1.5 overflow-hidden rounded-xl border border-slate-200 dark:border-[#333]">
          {hits.length === 0 ? <p className="p-3 text-sm text-slate-500">{t("noMatch")}</p> : hits.map(hit => (
            <button key={hit.code} type="button" data-testid={`technique-hit-${hit.code}`} onClick={() => { toggle(hit.code); setQuery("") }}
              className="block min-h-12 w-full border-b border-slate-100 px-3 py-2 text-left last:border-b-0 dark:border-[#2a2a2a]">
              <span className="block text-sm font-bold">{label(hit.code)}{techniques.includes(hit.code) ? " ✓" : ""}</span>
              <span className="block text-[11.5px] text-slate-500">{path(hit.code)}</span>
            </button>
          ))}
        </div>
      ) : recents.length > 0 ? (
        <>
          <p className={eyebrow}>{t("usual")}</p>
          <div className="flex flex-wrap gap-2">
            {recents.map(code => {
              const on = techniques.includes(code)
              return (
                <button key={code} type="button" aria-pressed={on} data-testid={`technique-recent-${code}`} onClick={() => toggle(code)}
                  className={`min-h-11 rounded-xl border px-3 text-sm font-semibold ${on ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30" : "border-slate-200 dark:border-[#333]"}`}>{label(code)}</button>
              )
            })}
          </div>
        </>
      ) : null}

      <p className={eyebrow}>{t("all")}</p>
      {tree.map(node => node.v === "OTHER" ? (
        <input key={node.v} data-testid="technique-other" value={otherText} onChange={event => setOtherText(event.target.value)} placeholder={label(node.v)}
          onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); addOther() } }}
          className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-[#444] dark:bg-[#141414]" />
      ) : renderNode(node))}
    </div>
  )
}
