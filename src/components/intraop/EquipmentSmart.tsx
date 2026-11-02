"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import type { EquipmentCategory } from "@lospor/core/equipment"
import {
  EQUIPMENT_GLANCE, equipmentGroups, equipmentItemKey, equipmentNeedsChoice, equipmentRecordState, equipmentTapAction, equipmentTarget,
  type EquipmentFlagState,
} from "@lospor/core/equipment-smart"

/**
 * The Equipment card, Smart selection (10.2.0): the six airway numbers as a glance grid and every other
 * item as a checklist by group. A tap marks an item ready (kept in this browser tab). On the tube and
 * the LMA a second tap marks it in use, which writes the device to the Airway record. The urinary
 * catheter and the NGT set their case flag at once, and the flag is the tick. What each item does is
 * Core's (equipment-smart); the text is localised by the caller.
 */
export function EquipmentSmart({ categories, flags, airwayInUse, onFlag, onUseAirway, categoryName, labelOf, textOf }: {
  categories: readonly EquipmentCategory[]
  flags: EquipmentFlagState
  airwayInUse: readonly string[]
  onFlag: (field: "urinaryCatheter" | "stomachTube") => void
  onUseAirway: (device: "ORAL_ETT" | "LMA") => void
  categoryName: (category: string) => string
  labelOf: (label: string) => string
  textOf: (value: string) => string
}) {
  const t = useTranslations("intraop.equipmentSmart")
  const [ready, setReady] = useState<Record<string, boolean>>({})
  const [closed, setClosed] = useState<Record<string, boolean>>({})
  const record = { flags, airwayInUse }
  const items = categories.flatMap(category => category.items.map(item => ({ category: category.cat, item })))
  const isInUse = (label: string) => equipmentRecordState(label, record) === "in_use"
  const isDone = (category: string, label: string) => isInUse(label) || !!ready[equipmentItemKey(category, label)]
  const done = items.filter(entry => isDone(entry.category, entry.item.label)).length

  function tap(category: string, label: string, value: string) {
    // A tube or LMA size left to the clinician cannot be written for them, so that item is only ticked ready.
    // A catheter or NGT writes no size, so it still sets its flag.
    const found = equipmentTarget(label)
    const target = found?.kind === "airway" && equipmentNeedsChoice(value) ? null : found
    const key = equipmentItemKey(category, label)
    const action = target ? equipmentTapAction(label, { ready: !!ready[key], inUse: isInUse(label) }) : (ready[key] ? "unready" : "ready")
    if (action === "ready") setReady(current => ({ ...current, [key]: true }))
    else if (action === "unready") setReady(current => ({ ...current, [key]: false }))
    else if (action === "use" && target?.kind === "airway") onUseAirway(target.device)
    else if ((action === "flag" || action === "unflag") && target?.kind === "flag") onFlag(target.field)
  }

  const airway = categories.find(category => category.cat === "Airway")
  const groups = equipmentGroups(categories)

  return (
    <div className="p-3" data-testid="equipment-smart">
      <div className="flex justify-between text-xs text-slate-500">
        <span>{t("setUp")}</span>
        <span data-testid="equipment-progress">{done} / {items.length}</span>
      </div>
      <div className="mt-1 mb-3 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-[#2e2e2e]">
        <div className="h-full bg-emerald-500 transition-all" style={{ width: `${items.length ? (100 * done) / items.length : 0}%` }} />
      </div>

      {airway ? (
        <>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{t("glance")}</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {EQUIPMENT_GLANCE.map(label => {
              const item = airway.items.find(entry => entry.label === label)
              if (!item) return null
              const choose = equipmentNeedsChoice(item.value)
              const on = isDone("Airway", label)
              return (
                <button key={label} type="button" aria-pressed={on} data-testid={`equipment-cell-${label}`} onClick={() => tap("Airway", label, item.value)}
                  className={`flex min-h-20 flex-col items-center justify-center gap-0.5 rounded-xl border-2 p-2 text-center ${on ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30" : "border-slate-200 dark:border-[#333]"}`}>
                  <span className="text-[10.5px] text-slate-500">{labelOf(label)}</span>
                  <span className={choose ? "text-xs font-bold text-amber-600 dark:text-amber-400" : "text-lg font-extrabold tabular-nums"}>{choose ? t("choose") : textOf(item.value)}</span>
                  {isInUse(label) ? <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300">{t("inUse")}</span> : on ? <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300">{t("ready")}</span> : null}
                </button>
              )
            })}
          </div>
        </>
      ) : null}

      {groups.map(group => {
        const count = group.items.filter(item => isDone(group.cat, item.label)).length
        const open = !closed[group.cat]
        return (
          <div key={group.cat} className="mt-3" data-testid={`equipment-group-${group.cat}`}>
            <button type="button" onClick={() => setClosed(current => ({ ...current, [group.cat]: open }))} className="flex min-h-11 w-full items-center gap-2 text-left text-sm font-bold">
              <span className="h-3.5 w-0.5 rounded" style={{ background: group.color ?? "#64748b" }} />
              <span className="flex-1">{categoryName(group.cat)}</span>
              <span className={`text-xs ${count === group.items.length ? "text-emerald-600" : "text-slate-500"}`}>{count}/{group.items.length} {open ? "▾" : "▸"}</span>
            </button>
            {open ? group.items.map(item => {
              const on = isDone(group.cat, item.label)
              const choose = equipmentNeedsChoice(item.value)
              return (
                <button key={item.label} type="button" aria-pressed={on} data-testid={`equipment-row-${group.cat}-${item.label}`} onClick={() => tap(group.cat, item.label, item.value)}
                  className={`mb-1.5 flex w-full items-start gap-3 rounded-xl border p-2.5 text-left ${on ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30" : "border-slate-200 dark:border-[#333]"}`}>
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm font-semibold ${on ? "line-through opacity-70" : ""}`}>{labelOf(item.label)}</span>
                    <span className={`block text-sm ${choose ? "text-amber-600 dark:text-amber-400" : ""}`}>{textOf(item.value)}</span>
                    {item.note ? <span className="mt-0.5 block text-[11.5px] leading-snug text-slate-500">{textOf(item.note)}</span> : null}
                  </span>
                  <span className={`grid h-7 w-7 flex-none place-items-center rounded-full border-2 text-sm font-bold ${on ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300"}`}>{on ? "✓" : ""}</span>
                </button>
              )
            }) : null}
          </div>
        )
      })}
    </div>
  )
}
