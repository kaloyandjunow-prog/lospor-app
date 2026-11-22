"use client"

import { useTranslations } from "next-intl"
import { ConfirmDialog } from "@/components/intraop/ConfirmDialog"
import { EndCaseModal, type EndCaseModalProps } from "@/components/intraop/EndCaseModal"
import { useIntraopUiCopy } from "@/components/intraop/ui-copy"
import type { AgentSegment, GasSettingsSegment, TimetableFluid, TimetableInfusion } from "@/types/timetable"

type Props = {
  deleteInfPrompt: string | null
  onCancelDelete: () => void
  onDeleteInfusion: (id: string) => void
  showEndModal: boolean
  agents: AgentSegment[]
  infusions: TimetableInfusion[]
  fluids: TimetableFluid[]
  gasSettings: GasSettingsSegment[]
  weightBasis: EndCaseModalProps["weightBasis"]
  ibw: number | null | undefined
  tbw: number | null | undefined
  afterEnd: EndCaseModalProps["afterEnd"]
  onResolveAfterEnd: EndCaseModalProps["onResolveAfterEnd"]
  onDismissEnd: () => void
  onConfirmEnd: EndCaseModalProps["onConfirm"]
}

export function TimetableEndOverlays({
  deleteInfPrompt,
  onCancelDelete,
  onDeleteInfusion,
  showEndModal,
  agents,
  infusions,
  fluids,
  gasSettings,
  weightBasis,
  ibw,
  tbw,
  afterEnd,
  onResolveAfterEnd,
  onDismissEnd,
  onConfirmEnd,
}: Props) {
  const t = useTranslations()
  const uiCopy = useIntraopUiCopy()
  return <>
    {deleteInfPrompt && <ConfirmDialog title={t("intraop.timetable.deleteInfusionConfirm")} detail={t("intraop.timetable.barDraggedOffTimeline")} cancelLabel={uiCopy.cancel} confirmLabel={uiCopy.delete} onCancel={onCancelDelete} onConfirm={() => onDeleteInfusion(deleteInfPrompt)} />}
    {showEndModal && <EndCaseModal agents={agents} infusions={infusions} fluids={fluids} gasSettings={gasSettings} weightBasis={weightBasis} ibw={ibw} tbw={tbw} afterEnd={afterEnd} onResolveAfterEnd={onResolveAfterEnd} onDismiss={onDismissEnd} onConfirm={onConfirmEnd} />}
  </>
}
