// Canonical shape of the intraop timetable wire format — shared between the
// server (src/lib/case-events.ts, the append-only CaseEvent projection) and
// the client (src/components/IntraopTimetable.tsx, the live chart). Lives in
// its own type-only file rather than either of those two so neither has to
// import from the other (one is server-only Prisma infrastructure, the other
// is "use client").

export interface VitalsEntry    { systolic?: number; diastolic?: number; heartRate?: number; spO2?: number; etco2?: number; temp?: number; bgl?: number }
export interface TimetableDrug  { colIdx: number; name: string; dose: string; unit: string; drugId?: string; atcCode?: string; inn?: string; route?: string }
export interface TimetableFluid { id: string; name: string; category?: string; volume: string; color: string; startCol: number; endCol: number; stopped?: boolean }
export interface AgentSegment   { name: string; color?: string; startCol: number; endCol: number; n2o?: number; percent?: number; stopped?: boolean }
export interface TimetableInfusion { id: string; name: string; rate: number; unit: string; startCol: number; endCol: number; color: string; stopped?: boolean; concentration?: string; route?: string; drugId?: string; atcCode?: string; inn?: string; rateChanges?: { col: number; rate: number; unit: string; concentration?: string }[] }
export interface ClinicalEvent    { colIdx: number; label: string; color: string }
// FGF/carrier-gas/FiO2 — unlike agents (single static value per segment),
// these get titrated continuously during a real case (especially FiO2 in
// response to SpO2), so this carries the same change-tracking shape as
// TimetableInfusion's rateChanges rather than the simpler AgentSegment model.
export interface GasSettingsSegment {
  id: string; startCol: number; endCol: number; stopped?: boolean
  fgf: number; carrierGas: string | null; fio2: number; fiAir?: number; fiN2O?: number
  settingsChanges?: { col: number; fgf: number; carrierGas: string | null; fio2: number; fiAir?: number; fiN2O?: number }[]
}
export interface TimetableData  { vitals: VitalsEntry[]; drugs: TimetableDrug[]; fluids: TimetableFluid[]; agents: AgentSegment[]; infusions: TimetableInfusion[]; gasSettings?: GasSettingsSegment[]; clinicalEvents?: ClinicalEvent[] }

// Raw append-only log event — what case-events.ts persists/replays and what
// IntraopTimetable.tsx's mobile-event-log + onLogEvent callback deal in. This
// is the single source of truth other than the alias re-exported as
// IntraopLogEvent from IntraopTimetable.tsx for existing import sites.
export type LogEvent = {
  id?: string
  ts?: string
  type?: string
  name?: string
  dose?: string
  unit?: string
  category?: string
  color?: string
  systolic?: number
  diastolic?: number
  heartRate?: number
  spO2?: number
  etco2?: number
  temp?: number
  bgl?: number
  infId?: string
  rate?: string
  fluidId?: string
  volume?: string
  label?: string
  value?: string
  atcCode?: string
  drugId?: string
  inn?: string
  drugRoute?: string
  concentration?: string
  fgf?: number
  carrierGas?: string | null
  fio2?: number
  fiAir?: number
  fiN2O?: number
}

// Shape of the IntraoperativeRecord.keyEvents Json column: the projected
// TimetableData arrays plus the raw append-only log they were built from.
export type LegacyKeyEvents = Partial<TimetableData> & { log?: LogEvent[] }
