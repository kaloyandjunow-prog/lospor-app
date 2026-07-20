"use client"

import { useEffect, useState } from "react"
import { format } from "date-fns"
import { apfelRiskLabel, rcriRiskLabel, stopBangRiskLabel, calcIBW } from "@/lib/scores"
import { useLocale } from "next-intl"
import { useRouter } from "next/navigation"
import { HANDOVER_GROUPS_EN, HANDOVER_GROUPS_BG } from "@/components/forms/PostopForm"
import { CASE_STATUS_LABELS, type CaseStatus } from "@lospor/core/case-status"
import type { Tag } from "@/components/TagInput"
import type { CaseDetail, CaseDetailIntraop } from "@/types/case-detail"
import { FINALIZE_UNDO_WINDOW_MS } from "@/lib/constants"
import { PrintTimetable, calcDrugTotals, calcInfTotals, naturalMaxCols, buildDrugLog } from "@/components/case-summary/PrintTimetable"
import { planPanels, type PanelPlan } from "@lospor/core/print"

// ── Enum label maps ───────────────────────────────────────────────────────────
const TECHNIQUE_LABELS: Record<string, { en: string; bg: string }> = {
  // General
  GENERAL_INHALATION:      { en: "General Inhalation",              bg: "Обща инхалационна"                        },
  GENERAL_TIVA:            { en: "General IV (TIVA)",               bg: "Обща венозна (ТИВА)"                      },
  GENERAL_COMBINED:        { en: "General Combined",                bg: "Обща комбинирана"                         },
  GENERAL_BALANCED:        { en: "General Combined",                bg: "Обща комбинирана"                         }, // legacy alias
  // Neuraxial — generic
  SPINAL:                  { en: "Spinal",                          bg: "Спинална"                                 },
  SPINAL_SINGLE:           { en: "Spinal (single-shot)",            bg: "Спинална (единична доза)"                 },
  SPINAL_CONTINUOUS:       { en: "Spinal (continuous)",             bg: "Спинална (непрекъсната)"                  },
  // Spinal single-shot location variants
  SPINAL_SINGLE_LUMBAR:         { en: "Spinal — Lumbar",            bg: "Спинална — лумбална"                      },
  SPINAL_SINGLE_LOW_THORACIC:   { en: "Spinal — Low thoracic",      bg: "Спинална — ниска гръдна"                  },
  SPINAL_SINGLE_MID_THORACIC:   { en: "Spinal — Mid thoracic",      bg: "Спинална — средна гръдна"                 },
  SPINAL_SINGLE_HIGH_THORACIC:  { en: "Spinal — High thoracic",     bg: "Спинална — висока гръдна"                 },
  // Spinal continuous variants
  SPINAL_CONT_LUMBAR:           { en: "Spinal cont. — Lumbar",      bg: "Спинална непрекъсната — лумбална"         },
  SPINAL_CONT_LOW_THORACIC:     { en: "Spinal cont. — Low thor.",   bg: "Спинална непрекъсната — ниска гръдна"     },
  SPINAL_CONT_MID_THORACIC:     { en: "Spinal cont. — Mid thor.",   bg: "Спинална непрекъсната — средна гръдна"    },
  SPINAL_CONT_HIGH_THORACIC:    { en: "Spinal cont. — High thor.",  bg: "Спинална непрекъсната — висока гръдна"    },
  // Epidural
  EPIDURAL:                { en: "Epidural",                        bg: "Епидурална"                               },
  EPIDURAL_CAUDAL:         { en: "Epidural — Caudal",              bg: "Епидурална — каудална"                    },
  EPIDURAL_LUMBAR:         { en: "Epidural — Lumbar",              bg: "Епидурална — лумбална"                    },
  EPIDURAL_LOW_THORACIC:   { en: "Epidural — Low thoracic",        bg: "Епидурална — ниска гръдна"                },
  EPIDURAL_MID_THORACIC:   { en: "Epidural — Mid thoracic",        bg: "Епидурална — средна гръдна"               },
  EPIDURAL_HIGH_THORACIC:  { en: "Epidural — High thoracic",       bg: "Епидурална — висока гръдна"               },
  // CSE / DPE
  COMBINED_SPINAL_EPIDURAL:{ en: "Combined Spinal-Epidural (CSE)", bg: "Комбинирана спинало-епидурална (КСЕ)"      },
  CSE:                     { en: "CSE",                            bg: "КСЕ"                                      }, // legacy alias
  CSE_LUMBAR:              { en: "CSE — Lumbar",                   bg: "КСЕ — лумбална"                           },
  CSE_LOW_THORACIC:        { en: "CSE — Low thoracic",             bg: "КСЕ — ниска гръдна"                       },
  CSE_MID_THORACIC:        { en: "CSE — Mid thoracic",             bg: "КСЕ — средна гръдна"                      },
  CSE_HIGH_THORACIC:       { en: "CSE — High thoracic",            bg: "КСЕ — висока гръдна"                      },
  DPE:                     { en: "Dural Puncture Epidural (DPE)",  bg: "Дурална пункция + епидурал (ДПЕ)"         },
  // Peripheral blocks — upper
  PERIPHERAL_NERVE_BLOCK:  { en: "Peripheral Nerve Block",         bg: "Периферен нервен блок"                    },
  BLOCK_UPPER:             { en: "Upper extremity block",          bg: "Блок — горен крайник"                     },
  BLOCK_INTERSCALENE:      { en: "Interscalene block",             bg: "Интерскаленен блок"                       },
  BLOCK_SUPRACLAVICULAR:   { en: "Supraclavicular block",          bg: "Супраклавикуларен блок"                   },
  BLOCK_INFRACLAVICULAR:   { en: "Infraclavicular block",          bg: "Инфраклавикуларен блок"                   },
  BLOCK_AXILLARY:          { en: "Axillary block",                 bg: "Аксиларен блок"                           },
  BLOCK_WRIST:             { en: "Wrist block",                    bg: "Блок на китката"                          },
  BLOCK_DIGITAL:           { en: "Digital block",                  bg: "Дигитален блок"                           },
  BLOCK_BIER:              { en: "Bier block (IVRA)",              bg: "Биерова блокада (ИВРА)"                   },
  BLOCK_ELBOW:             { en: "Elbow block",                    bg: "Блок на лакътя"                           },
  // Peripheral blocks — lower
  BLOCK_LOWER:             { en: "Lower extremity block",          bg: "Блок — долен крайник"                     },
  BLOCK_FEMORAL:           { en: "Femoral nerve block",            bg: "Феморален блок"                           },
  BLOCK_ADDUCTOR:          { en: "Adductor canal block",           bg: "Адукторен канален блок"                   },
  BLOCK_SCIATIC:           { en: "Sciatic nerve block",            bg: "Седалищен блок"                           },
  BLOCK_POPLITEAL:         { en: "Popliteal sciatic block",        bg: "Поплитеален блок"                         },
  BLOCK_ANKLE:             { en: "Ankle block",                    bg: "Блок на глезена"                          },
  BLOCK_OBTURATOR:         { en: "Obturator nerve block",          bg: "Обтураторен блок"                         },
  BLOCK_LAT_FEMORAL:       { en: "Lat. femoral cutaneous block",   bg: "Страничен феморален кожен блок"           },
  BLOCK_LUMBAR_PLEXUS:     { en: "Lumbar plexus (psoas) block",    bg: "Лумбален плексус (псоас) блок"            },
  BLOCK_IPACK:             { en: "IPACK block",                    bg: "ИПАК блок"                                },
  BLOCK_GENICULAR:         { en: "Genicular nerve block",          bg: "Геникуларен блок"                         },
  BLOCK_FOOT:              { en: "Foot block",                     bg: "Блок на стъпалото"                        },
  // Peripheral blocks — trunk
  BLOCK_TRUNK:             { en: "Trunk / abdominal wall block",   bg: "Блок на корема / туловище"                },
  BLOCK_TAP:               { en: "TAP block",                      bg: "ТАП блок"                                 },
  BLOCK_RECTUS:            { en: "Rectus sheath block",            bg: "Блок на ректусовата обвивка"              },
  BLOCK_PARAVERTEBRAL:     { en: "Paravertebral block",            bg: "Паравертебрален блок"                     },
  BLOCK_ESP:               { en: "Erector spinae block (ESP)",     bg: "Блок на изправителя на гръбнака (ЕСП)"    },
  BLOCK_SERRATUS:          { en: "Serratus anterior block",        bg: "Блок на предния зъбец"                    },
  BLOCK_PECS1:             { en: "PECS I block",                   bg: "ПЕКС I блок"                              },
  BLOCK_PECS2:             { en: "PECS II block",                  bg: "ПЕКС II блок"                             },
  BLOCK_QL:                { en: "Quadratus lumborum block (QL)",  bg: "Квадратен лумбален блок (КЛ)"             },
  BLOCK_ILIOINGUINAL:      { en: "Ilioinguinal / iliohypogastric", bg: "Илиоингвинален / илиохипогастрален блок"   },
  BLOCK_INTERCOSTAL:       { en: "Intercostal block",              bg: "Интеркостален блок"                       },
  // Head & neck
  BLOCK_HEAD_NECK:               { en: "Head & neck block",        bg: "Блок — глава и шия"                       },
  BLOCK_SUPERFICIAL_CERVICAL:    { en: "Superficial cervical plexus", bg: "Повърхностен шиен плексус"             },
  BLOCK_DEEP_CERVICAL:           { en: "Deep cervical plexus",     bg: "Дълбок шиен плексус"                      },
  BLOCK_SCALP:                   { en: "Scalp block",              bg: "Блок на скалпа"                           },
  BLOCK_TRIGEMINAL:              { en: "Trigeminal nerve block",   bg: "Тригеминален блок"                        },
  // Ophthalmic
  BLOCK_OPHTHALMIC:        { en: "Ophthalmic block",               bg: "Офталмологичен блок"                      },
  BLOCK_PERIBULBAR:        { en: "Peribulbar block",               bg: "Перибулбарен блок"                        },
  BLOCK_RETROBULBAR:       { en: "Retrobulbar block",              bg: "Ретробулбарен блок"                       },
  BLOCK_SUB_TENONS:        { en: "Sub-Tenon's block",              bg: "Суб-Тенонов блок"                         },
  BLOCK_TOPICAL_EYE:       { en: "Topical (eye)",                  bg: "Топикална (окото)"                        },
  // Sedation
  LOCAL:                   { en: "Local Anaesthesia",              bg: "Местна анестезия"                         },
  SEDATION:                { en: "Sedation",                       bg: "Седация"                                  },
  SEDATION_CONSCIOUS:      { en: "Conscious sedation",             bg: "Съзнателна седация"                       },
  SEDATION_DEEP:           { en: "Deep sedation",                  bg: "Дълбока седация"                          },
  SEDATION_MAC:            { en: "MAC",                            bg: "МАК"                                      },
  OTHER:                   { en: "Other technique",                bg: "Друга техника"                            },
}

const TOOL_LABELS: Record<string, { en: string; bg: string }> = {
  VIDEO_LARY:   { en: "Video laryngoscopy",        bg: "Видеоларингоскопия"                },
  DIRECT_LARY:  { en: "Direct laryngoscopy",       bg: "Директна ларингоскопия"            },
  FOB:          { en: "Fibreoptic bronchoscopy",   bg: "Фиброоптична бронхоскопия"         },
  BOUGIE:       { en: "Bougie",                    bg: "Буже"                              },
  STYLET:       { en: "Intubation stylet",         bg: "Стилет за интубация"               },
  AWAKE:        { en: "Awake intubation",          bg: "Интубация при буден пациент"       },
  RETROGRADE:   { en: "Retrograde intubation",     bg: "Ретроградна интубация"             },
  SUPRAGLOTTIC: { en: "Supraglottic as conduit",   bg: "Супраглотичен дихателен канал"     },
}

const POSITION_LABELS: Record<string, { en: string; bg: string }> = {
  SUPINE:                  { en: "Supine",                bg: "Супинация"                   },
  PRONE:                   { en: "Prone",                 bg: "Пронация"                    },
  LEFT_LATERAL:            { en: "Left lateral",          bg: "Ляво странично"              },
  RIGHT_LATERAL:           { en: "Right lateral",         bg: "Дясно странично"             },
  GYNECOLOGICAL:           { en: "Gynecological",         bg: "Гинекологично"               },
  TRENDELENBURG:           { en: "Trendelenburg",         bg: "Тренделенбург"               },
  REVERSE_TRENDELENBURG:   { en: "Rev. Trendelenburg",    bg: "Обратен Тренделенбург"       },
  FOWLER:                  { en: "Fowler's",              bg: "Полуседнало (Фаулър)"        },
  BEACH_CHAIR:             { en: "Beach chair",           bg: "Beach chair"                 },
  LLOYD_DAVIES:            { en: "Lloyd Davies",          bg: "Lloyd Davies"                },
  LATERAL_DECUBITUS_LEFT:  { en: "Lateral decub. L",      bg: "Ляв латерален декубитус"     },
  LATERAL_DECUBITUS_RIGHT: { en: "Lateral decub. R",      bg: "Десен латерален декубитус"   },
  SITTING:                 { en: "Sitting",               bg: "Седнало"                     },
  JACKKNIFE:               { en: "Jackknife",             bg: "Jackknife"                   },
  KNEE_CHEST:              { en: "Knee-chest",            bg: "Коляно-гръдно"               },
}

function tLabel(map: Record<string, { en: string; bg: string }>, key: string, locale: string): string {
  const entry = map[key]
  if (!entry) return key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())
  return locale === "bg" ? entry.bg : entry.en
}

// ── Monitoring field map ─────────────────────────────────────────────────────
const DEVICE_DISPLAY: Record<string, { en: string; bg: string; prefix_en?: string; prefix_bg?: string }> = {
  ORAL_ETT:          { en: "Oral ETT",         bg: "Орален ЕТТ"              },
  NASAL_ETT:         { en: "Nasal ETT",        bg: "Назален ЕТТ"             },
  LMA:               { en: "LMA",              bg: "ЛМА"                     },
  FACE_MASK:         { en: "Face Mask",        bg: "Лицева маска"             },
  OPA:               { en: "Oral airway (OPA)",bg: "Орофарингеален въздуховод (ОПА)" },
  NPA:               { en: "Nasal airway (NPA)",bg: "Назофарингеален въздуховод (НПА)" },
  DOUBLE_LUMEN_TUBE: { en: "DLT",             bg: "ДЛТ"                     },
  ENDOBRONCHIAL_TUBE:{ en: "Endobronchial",   bg: "Ендобронхиална тръба"    },
  SURGICAL_AIRWAY:   { en: "Surgical Airway", bg: "Хирургичен дихателен път" },
}

function deviceLabel(i: CaseDetailIntraop | null | undefined, locale: string): string {
  const isBg = locale === "bg"
  const devs: string[] = Array.isArray(i?.airwayDevices) ? i.airwayDevices : []
  const cuffedStr = (cuffed: boolean | null | undefined) => cuffed != null
    ? (cuffed ? (isBg ? " с маншет" : " cuffed") : (isBg ? " без маншет" : " uncuffed"))
    : ""
  return devs.map((d: string) => {
    if (d === "ORAL_ETT")
      return `${DEVICE_DISPLAY.ORAL_ETT[isBg ? "bg" : "en"]}${i?.oralTubeSize ? " " + i.oralTubeSize + "mm" : ""}${cuffedStr(i?.oralCuffed)}`
    if (d === "NASAL_ETT")
      return `${DEVICE_DISPLAY.NASAL_ETT[isBg ? "bg" : "en"]}${i?.nasalTubeSize ? " " + i.nasalTubeSize + "mm" : ""}${cuffedStr(i?.nasalCuffed)}`
    if (d === "LMA")                return `${DEVICE_DISPLAY.LMA[isBg ? "bg" : "en"]}${i?.lmaSize ? " " + i.lmaSize : ""}`
    if (d === "DOUBLE_LUMEN_TUBE")  return `${DEVICE_DISPLAY.DOUBLE_LUMEN_TUBE[isBg ? "bg" : "en"]}${i?.dltType ? " " + i.dltType : ""}${i?.dltSide ? " " + i.dltSide : ""}${i?.dltSize ? " " + i.dltSize + "Fr" : ""}`
    if (d === "ENDOBRONCHIAL_TUBE") return `${DEVICE_DISPLAY.ENDOBRONCHIAL_TUBE[isBg ? "bg" : "en"]}${i?.endobronchialSize ? " " + i.endobronchialSize + "mm" : ""}`
    return (DEVICE_DISPLAY[d]?.[isBg ? "bg" : "en"]) ?? d.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())
  }).join(" + ") || "—"
}

const MON: { f: keyof CaseDetailIntraop; l: string }[] = [
  { f: "ecg",              l: "ECG"      },
  { f: "spO2Monitor",      l: "SpO₂"     },
  { f: "nbpMonitor",       l: "NBP"      },
  { f: "etco2Monitor",     l: "EtCO₂"    },
  { f: "tempMonitor",      l: "Temp"     },
  { f: "invasiveBP",       l: "IBP"      },
  { f: "cvpMonitor",       l: "CVP"      },
  { f: "paCatheter",       l: "PA cath"  },
  { f: "tee",              l: "TEE"      },
  { f: "bis",              l: "BIS"      },
  { f: "entropyMonitor",   l: "Entropy"  },
  { f: "nirsMonitor",      l: "NIRS"     },
  { f: "evokedPotentials", l: "SSEP/MEP" },
  { f: "tofMonitor",       l: "TOF/NMT"  },
  { f: "bglMonitor",       l: "Serum/peripheral glucose" },
  { f: "bloodGasMonitor",  l: "ABG"      },
  { f: "urinaryCatheter",  l: "Urine"    },
  { f: "stomachTube",      l: "NGT"      },
]

function F({ label, value }: { label: string; value?: string | number | null }) {
  if (value == null || value === "") return null
  return (
    <div className="flex justify-between gap-2 py-[2px] border-b border-slate-100 dark:border-[#252525] last:border-0 text-[10.5px]">
      <span className="text-slate-500 dark:text-slate-400 shrink-0">{label}</span>
      <span className="font-semibold text-slate-800 dark:text-slate-100 text-right min-w-0 break-words">{String(value)}</span>
    </div>
  )
}

function Chip({ children, color = "slate" }: { children: string; color?: string }) {
  const c: Record<string, string> = {
    slate:  "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    blue:   "bg-blue-100  text-blue-800  dark:bg-blue-900/40 dark:text-blue-300",
    amber:  "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
    red:    "bg-red-100   text-red-700   dark:bg-red-900/30  dark:text-red-300",
    green:  "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  }
  return <span className={`inline-block text-[8.5px] px-1.5 py-0.5 rounded font-medium mr-1 mb-1 ${c[color] ?? c.slate}`}>{children}</span>
}

// ── Protocol label translations ───────────────────────────────────────────────
const LABELS = {
  en: {
    record: "ANAESTHESIA RECORD", prepost: "PRE- & POST-OPERATIVE",
    intraopTt: "INTRAOPERATIVE TIMETABLE", preopAssessment: "PREOPERATIVE ASSESSMENT", postopRecoveryLbl: "POSTOPERATIVE RECOVERY",
    patientName: "Patient name", idFile: "ID / File №", nameSig: "name & signature",
    histCom: "History & comorbidities", investigations: "Investigations", airwayAssessment: "Airway assessment", anthropometry: "Anthropometry",
    aldreteTotalLbl: "Aldrete total", readyDischarge: "Ready for discharge", recoveryObs: "Recovery observations",
    footerLine: "LOSPOR personal case log · Not a clinical record · No patient identifiers stored — identity fields filled by hand after printing",
    generatedLbl: "Generated",
    printCase: "Print case", notNow: "Not now",
    printPromptTitle: "Case finished",
    printPromptText: "The case is closed and flagged as finished. Print the two-page anaesthesia record now?",
    protocol: "ANAESTHESIA PROTOCOL", preoppost: "Preoperative & Postoperative Assessment",
    staff: "Staff", patient: "Patient", anaesthesia: "Anaesthesia", monitoring: "Monitoring",
    vascular: "Vascular Access", premed: "Premedication", drugTotals: "Drug / agent totals", drugLog: "Drug administration log", totalsLbl: "Totals", fluidBal: "Fluid balance", notes: "Intraop notes",
    anaesthesiologist: "Anaesthesiologist", surgeon: "Surgeon", nurse: "Nurse", duration: "Duration",
    diagnosis: "Diagnosis", procedure: "Planned Procedure", heightWeight: "Height / Weight",
    technique: "Technique", airway: "Airway", tools: "Tools", ventilation: "Ventilation",
    agent: "Agent", position: "Position",
    cryst: "Cryst.", colloid: "Colloid", blood: "Blood", urine: "Urine",
    riskScores: "Risk Scores", preVitals: "Preoperative Vitals", comorbidities: "Comorbidities",
    medications: "Medications", allergies: "Allergies", lab: "Laboratory",
    mouthOpening: "Mouth opening", thyromental: "Thyromental dist.", neckMobility: "Neck mobility",
    clGrade: "C-L grade", bp: "BP", hr: "HR", temp: "Temp", rr: "RR",
    postopRecovery: "Postoperative Recovery", total: "TOTAL", ready: "Ready",
    monitor: "Monitor", continueStr: "Continue", recovery: "Recovery",
    disposition: "Disposition", handover: "Handover",
    temperature: "Temperature", painNRS: "Pain NRS", ponv: "PONV",
    sigAnest: "Anaesthesiologist", sigNurse: "Anaesthesia nurse", sigSurg: "Surgeon",
    page1: "Page 1 of 2", page2: "Page 2 of 2", confidential: "Confidential",
    gdprNote: "GDPR: Patient-identifiable data — store securely. Anonymised record in LOSPOR.",
    reviewNote: "Review the two-page protocol below, then print or save as PDF.",
    privacyNote: "Patient name and ID are entered at print time only — they are never uploaded or stored.",
    printBtn: "🖨 Print / Save as PDF",
    warningTitle: "Before you print",
    warningText: "Once the case record has been finalised, any changes will require reopening the case again. Make sure all information is accurate before generating the protocol.",
    goBack: "Go back", continuePrint: "Continue to print",
    patientDialogTitle: "Patient identity for protocol",
    patientDialogNote: "These details are not stored in LOSPOR — only printed on the document.",
    lastNamePlaceholder: "Last name", firstNamePlaceholder: "First name", idPlaceholder: "File / ID number (optional)",
    cancel: "Cancel",
    noDrugs: "No drugs recorded", evening: "Evening", morning: "Morning",
    latexAllergy: "⚠ Latex allergy", familyHistory: "⚠ Family anaesthesia history",
    difficultAirway: "⚠ Difficult airway history",
    loadingCase: "Loading case summary…", loadFailed: "Failed to load case data.",
  },
  bg: {
    record: "АНЕСТЕЗИОЛОГИЧЕН ПРОТОКОЛ", prepost: "ПРЕД- И СЛЕДОПЕРАТИВНА ОЦЕНКА",
    intraopTt: "ИНТРАОПЕРАТИВНА ТАБЛИЦА", preopAssessment: "ПРЕДОПЕРАТИВНА ОЦЕНКА", postopRecoveryLbl: "ПОСТОПЕРАТИВНО ВЪЗСТАНОВЯВАНЕ",
    patientName: "Име на пациента", idFile: "ИЗ / Номер", nameSig: "име и подпис",
    histCom: "Анамнеза и придружаващи заболявания", investigations: "Изследвания", airwayAssessment: "Оценка на дихателния път", anthropometry: "Антропометрия",
    aldreteTotalLbl: "Общо Aldrete", readyDischarge: "Готов за извеждане", recoveryObs: "Наблюдения при възстановяване",
    footerLine: "LOSPOR личен журнал на случаи · Не е клиничен документ · Не се съхраняват лични данни — полетата за самоличност се попълват на ръка след печат",
    generatedLbl: "Генериран",
    printCase: "Печат на случая", notNow: "Не сега",
    printPromptTitle: "Случаят е приключен",
    printPromptText: "Случаят е затворен и отбелязан като приключен. Да се отпечата ли двустраничният анестезиологичен протокол сега?",
    protocol: "АНЕСТЕЗИОЛОГИЧЕН ПРОТОКОЛ", preoppost: "Предоперативна и следоперативна оценка",
    staff: "Персонал", patient: "Пациент", anaesthesia: "Анестезия", monitoring: "Мониторинг",
    vascular: "Съдов достъп", premed: "Премедикация", drugTotals: "Медикаменти / агенти", drugLog: "Дневник на медикаментите", totalsLbl: "Общо", fluidBal: "Баланс на течности", notes: "Интраоп. бележки",
    anaesthesiologist: "Анестезиолог", surgeon: "Хирург", nurse: "Мед. сестра", duration: "Продължителност",
    diagnosis: "Диагноза", procedure: "Интервенция", heightWeight: "Ръст / Тегло",
    technique: "Техника", airway: "Дихателен път", tools: "Инструменти", ventilation: "Вентилация",
    agent: "Агент", position: "Положение",
    cryst: "Крист.", colloid: "Колоид", blood: "Кръв", urine: "Диуреза",
    riskScores: "Скали за оценка на риска", preVitals: "Предоп. витални показатели", comorbidities: "Придружаващи заболявания",
    medications: "Медикаменти", allergies: "Алергии", lab: "Лабораторни изследвания",
    mouthOpening: "Разстояние между резците", thyromental: "Тиромандибулярно разст.", neckMobility: "Подвижност на шията",
    clGrade: "C-L степен", bp: "АН", hr: "СЧ", temp: "Темп.", rr: "ДЧ",
    postopRecovery: "Постоперативно състояние", total: "ОБЩО", ready: "Готов",
    monitor: "Наблюдение", continueStr: "Продължи", recovery: "Състояние при извеждане от операционната зала",
    disposition: "Извежда се към", handover: "Препоръки за постоперативния период",
    temperature: "Температура", painNRS: "Болкова скала NRS", ponv: "ПОНВ",
    sigAnest: "Анестезиолог", sigNurse: "Анестезиологична мед. сестра", sigSurg: "Хирург",
    page1: "Страница 1 от 2", page2: "Страница 2 от 2", confidential: "Поверително",
    gdprNote: "GDPR: Документът съдържа лични данни — съхранявайте в историята. Анонимен запис в LOSPOR.",
    reviewNote: "Прегледайте протокола по-долу, след което отпечатайте или запазете като PDF.",
    privacyNote: "Имената и ИД на пациента се въвеждат само при печат — никога не се качват или съхраняват.",
    printBtn: "🖨 Печат / Запази като PDF",
    warningTitle: "Преди да отпечатате",
    warningText: "След финализиране на случая промените изискват повторното му отваряне. Уверете се, че всички данни са верни преди генерирането на протокола.",
    goBack: "Назад", continuePrint: "Продължи към печат",
    patientDialogTitle: "Самоличност на пациента за протокола",
    patientDialogNote: "Тези данни не се съхраняват в LOSPOR — само се отпечатват на документа.",
    lastNamePlaceholder: "Фамилия", firstNamePlaceholder: "Собствено", idPlaceholder: "ИЗ / Идентификатор (незадължително)",
    cancel: "Отказ",
    noDrugs: "Без записани медикаменти", evening: "Вечер", morning: "Сутрин",
    latexAllergy: "⚠ Алергия към латекс", familyHistory: "⚠ Фамилна анестезиологична история",
    difficultAirway: "⚠ История на труден дихателен път",
    loadingCase: "Зареждане на резюмето…", loadFailed: "Грешка при зареждане на данните.",
  },
}

// ── Main Component ────────────────────────────────────────────────────────────
// mode="summary" (default): the live case summary — review bar, continuous
// paper-style content, NO print chrome and NO print buttons (printing moved to
// the dedicated /cases/[id]/print page for finished cases).
// mode="print": the A4 print sheets with page chrome + print CSS, used by the
// print page. `initialData` lets the print page pass a server-fetched case
// (required for the mobile print-token flow, which has no browser session).
export function CaseSummary({ caseId, mode = "summary", initialData }: {
  caseId: string
  mode?: "summary" | "print"
  initialData?: CaseDetail
}) {
  const locale = useLocale()
  const router = useRouter()
  const isPrint = mode === "print"
  const L = locale === "bg" ? LABELS.bg : LABELS.en
  const handoverLookup = (() => {
    const groups = locale === "bg" ? HANDOVER_GROUPS_BG : HANDOVER_GROUPS_EN
    const map: Record<string, string> = {}
    groups.forEach(g => g.items.forEach(i => { map[i.code] = i.label }))
    return map
  })()

  const [data,       setData]       = useState<CaseDetail | null>(initialData ?? null)
  const [loading,    setLoading]    = useState(!initialData)
  const [showPrintPrompt, setShowPrintPrompt] = useState(false)
  const [finalizing, setFinalizing] = useState(false)
  const [nowAtMount] = useState<number>(Date.now)

  useEffect(() => {
    if (initialData) return // print-token flow: server already supplied the case
    let cancelled = false
    async function load() {
      const d = await fetch(`/api/cases/${caseId}`).then(r => r.json())
      if (!cancelled) { setData(d); setLoading(false) }
    }
    load()
    const onLive = () => load()
    window.addEventListener("case-live-update", onLive)
    return () => {
      cancelled = true
      window.removeEventListener("case-live-update", onLive)
    }
  }, [caseId, initialData])

  if (loading) return <div className="text-sm text-slate-400 dark:text-slate-500 text-center py-12 animate-pulse">{L.loadingCase}</div>
  if (!data)   return <div className="text-sm text-red-500 text-center py-12">{L.loadFailed}</div>

  const p    = data.preop
  const i    = data.intraop
  const o    = data.postop
  const inst = data.institution

  const techniques:    string[] = Array.isArray(i?.techniques)       ? i.techniques       : []
  const positions:     string[] = Array.isArray(i?.positions)        ? i.positions        : []
  const ventModes:     string[] = Array.isArray(i?.ventilationModes) ? i.ventilationModes : []
  const airwayTools:   string[] = Array.isArray(i?.airwayTools)      ? i.airwayTools      : []
  type VascularAccessItem = { site?: string; siteLabel?: string; size?: string; sizeUnit?: string }
  type LabResultItem = { test?: string; value?: string; unit?: string }
  const vascular:      VascularAccessItem[] = Array.isArray(i?.vascularAccesses) ? i.vascularAccesses : []
  const comorbidities: Tag[]                = Array.isArray(p?.comorbidities)    ? p.comorbidities    : []
  const currentMedicationsText = (() => {
    const raw = p?.currentMedications
    if (!raw) return null
    const trimmed = raw.trim()
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed) as unknown[]
        if (Array.isArray(parsed)) return parsed
          .map((item) => {
            const med = item as { label?: unknown; inn?: unknown; name?: unknown }
            return med.label ?? med.inn ?? med.name
          })
          .filter((label): label is string => typeof label === "string" && label.length > 0)
          .join(", ")
      } catch {}
    }
    return raw
  })()
  const allergyDetailsText = (() => {
    const raw = p?.allergyDetails
    if (!raw) return null
    const trimmed = raw.trim()
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed) as unknown[]
        if (Array.isArray(parsed)) return parsed
          .map((item) => {
            const med = item as { label?: unknown; name?: unknown }
            return med.label ?? med.name
          })
          .filter((label): label is string => typeof label === "string" && label.length > 0)
          .join(", ")
      } catch {}
    }
    return raw
  })()
  const labResults:    LabResultItem[]      = Array.isArray(p?.labResults)       ? (p.labResults as LabResultItem[]).filter(l => l.value) : []
  const handoverItems: string[] = Array.isArray(o?.handoverItems)    ? o.handoverItems    : []
  const timetable = ((i?.keyEvents && typeof i.keyEvents === "object" && !Array.isArray(i.keyEvents)) ? i.keyEvents : {}) as import("@/types/timetable").LegacyKeyEvents

  // ── Panel planning: stacked half-case charts, paper-record style ───────────
  // ≤~5h: one full-height chart. Longer: TWO stacked panels (first half /
  // second half of the case) on the same sheet — nothing repeats, everything
  // gets twice the horizontal room. Continuation sheets only >~24h.
  const totalCols = naturalMaxCols(timetable)
  const panelPlans = planPanels({ totalCols })
  const sheet0Panels = panelPlans.filter(pl => pl.sheet === 0)
  const contSheets: PanelPlan[][] = []
  for (const pl of panelPlans) {
    if (pl.sheet === 0) continue
    ;(contSheets[pl.sheet - 1] ??= []).push(pl)
  }
  const pageTotal = contSheets.length + 2
  const contWord = locale === "bg" ? "ПРОДЪЛЖЕНИЕ" : "CONTINUED"
  const panelView = (pl: PanelPlan, withCaption: boolean) => ({
    c0: pl.startCol,
    c1: pl.endCol,
    step: Math.max(1, Math.round(pl.intervalMin / 5)),
    // Time-window caption drawn inside the chart's top-left corner
    caption: withCaption
      ? `${pl.index > 0 ? `${contWord} · ` : ""}${colHHMM(pl.startCol)} – ${colHHMM(pl.endCol + 1)}`
      : undefined,
  })
  // Column → wall-clock label (same UTC convention as the timetable itself)
  const colHHMM = (col: number) => {
    if (!i?.startTime) return `+${col * 5}m`
    const d = new Date(i.startTime)
    const mins = d.getUTCHours() * 60 + d.getUTCMinutes() + col * 5
    return `${String(Math.floor(mins / 60) % 24).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`
  }

  const activeMonitors = MON.filter(m => i?.[m.f]).map(m => m.l)
  const dateStr = (() => {
    if (!i?.monthYear) return ""
    const [y, m] = i.monthYear.split("-")
    const months = ["January","February","March","April","May","June","July","August","September","October","November","December"]
    return `${months[parseInt(m, 10) - 1] ?? ""} ${y}`
  })()
  const drugTotals     = calcDrugTotals(timetable)
  const infTotals      = calcInfTotals(timetable)
  const drugLog        = buildDrugLog(timetable, i?.startTime)
  const ageSuffix  = locale === "bg" ? "г." : "y"
  const sexLabel   = (s: string) => locale === "bg" ? (s === "MALE" ? "М" : s === "FEMALE" ? "Ж" : "") : (s === "MALE" ? "M" : s === "FEMALE" ? "F" : "")
  const patientLine = [p?.ageYears ? `${p.ageYears}${ageSuffix}` : "", p?.sex ? sexLabel(p.sex) : ""].filter(Boolean).join(" · ")

  function duration() {
    if (!i?.startTime || !i?.endTime) return null
    const s = new Date(i.startTime), e = new Date(i.endTime)
    const mins = Math.round((e.getTime() - s.getTime()) / 60000)
    // Stored times are UTC-encoded wall-clock; UTC getters recover the entered
    // time (same convention as the timetable's colToHHMM).
    const hhmm = (d: Date) => `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`
    return `${hhmm(s)} → ${hhmm(e)} · ${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`
  }

  const aldreteTotal = o?.aldreteTotal ?? 0
  const aldreteBg = aldreteTotal >= 9 ? "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 border-green-300 dark:border-green-700"
    : aldreteTotal >= 7 ? "bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700"
    : "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 border-red-300 dark:border-red-700"


  return (
    <>
      {/* ── Print styles — print mode only (summary is never printed) ────────── */}
      {isPrint && <style>{`
        @media print {
          @page { size: A4 landscape; margin: 0; }

          /* Both pages fill the full A4 landscape sheet.
             calc(210mm - 1px) avoids the Chrome float-rounding bug that creates a blank 3rd page. */
          .page-intraop,
          .page-preoppost {
            min-height: unset !important;
            width: 297mm !important;
            height: calc(210mm - 1px) !important;
            padding: 7mm !important;
            overflow: hidden !important;
            box-sizing: border-box !important;
            border: none !important;
            border-radius: 0 !important;
          }
          .page-preoppost { break-before: page; break-after: avoid; }
          /* Long cases: each detail sheet starts a new page */
          .page-intraop + .page-intraop { break-before: page; }
          /* Kill the on-screen space-y gap — a margin on a full-height sheet
             spills 12px onto an extra blank page */
          .page-intraop, .page-preoppost { margin: 0 !important; }
          /* Tighter internal rhythm on the intraop sheet — reclaims ~35px of
             height for the chart panels */
          .page-intraop { gap: 4px !important; }

          /* White paper regardless of dark mode */
          .protocol-root *:not(svg, svg *) {
            background-color: white !important;
            color: #1e293b !important;
            border-color: #e2e8f0 !important;
          }
          * { -webkit-print-color-adjust: exact !important; color-adjust: exact !important; print-color-adjust: exact !important; }
          .no-print { display: none !important; }
          /* SVG light-mode is handled via beforeprint listener — no filter needed */

          /* Compact lab rows in print — overrides Tailwind text-[10.5px] / py-[2px] */
          .lab-compact .lab-entry > div {
            font-size: 8px !important;
            padding-top: 1px !important;
            padding-bottom: 1px !important;
          }
          .lab-compact .lab-entry > div > * { font-size: 8px !important; }
        }
      `}</style>}

      {/* ── "Case finished — print it?" prompt (summary mode) ─────────────── */}
      {showPrintPrompt && (
        <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowPrintPrompt(false)}>
          <div className="bg-white dark:bg-[#1e1e1e] rounded-2xl shadow-2xl p-6 w-full max-w-md space-y-4"
            onClick={e => e.stopPropagation()}>
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">{L.printPromptTitle}</h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{L.printPromptText}</p>
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => setShowPrintPrompt(false)}
                className="flex-1 text-sm font-medium px-4 py-2 rounded-lg border border-slate-200 dark:border-[#3a3a3a] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#2a2a2a] transition-colors">
                {L.notNow}
              </button>
              <button type="button" onClick={() => { setShowPrintPrompt(false); router.push(`/cases/${caseId}/print`) }}
                className="flex-1 text-sm font-semibold px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors">
                {L.printCase}
              </button>
            </div>
          </div>
        </div>
      )}


      <div className="protocol-root space-y-3">

        {/* Review bar — summary mode only */}
        {!isPrint && (() => {
          const status = data?.status
          const finalizedAt = data?.finalizedAt ? new Date(data.finalizedAt).getTime() : null
          const withinUndoWindow = finalizedAt != null && nowAtMount - finalizedAt < FINALIZE_UNDO_WINDOW_MS
          // Labels come from @lospor/core/case-status (shared canonical text
          // with lospor-mobile); only the Tailwind styling and which 4 of
          // the 7 statuses this badge shows stay local to this component.
          const statusLabel = (key: CaseStatus) => CASE_STATUS_LABELS[key][locale === "bg" ? "bg" : "en"]
          const statusConfig: Record<string, { label: string; cls: string }> = {
            COMPLETE:        { label: statusLabel("COMPLETE"),        cls: "bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700 text-green-700 dark:text-green-400" },
            AWAITING_REVIEW: { label: statusLabel("AWAITING_REVIEW"), cls: "bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400" },
            IN_PROGRESS:     { label: statusLabel("IN_PROGRESS"),     cls: "bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-400" },
            DRAFT:           { label: statusLabel("DRAFT"),           cls: "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400" },
          }
          const sc = statusConfig[status ?? "DRAFT"] ?? statusConfig.DRAFT
          return (
            <div className={`no-print rounded-xl border px-4 py-3 space-y-2 ${sc.cls}`}>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <span className={`text-xs font-bold uppercase tracking-wide ${sc.cls.split(" ").filter(c => c.startsWith("text-")).join(" ")}`}>
                  {sc.label}
                </span>
                <div className="flex items-center gap-2 flex-wrap">
                  {status !== "COMPLETE" && (
                    <>
                      <span className="text-xs text-slate-400">Edit:</span>
                      <a href={`/cases/new?continue=${caseId}&step=0`}
                        className="text-xs font-semibold px-2 py-1 rounded border border-current opacity-70 hover:opacity-100 transition-opacity">
                        Preop
                      </a>
                      <a href={`/cases/new?continue=${caseId}&step=1`}
                        className="text-xs font-semibold px-2 py-1 rounded border border-current opacity-70 hover:opacity-100 transition-opacity">
                        Intraop
                      </a>
                      <a href={`/cases/new?continue=${caseId}&step=2`}
                        className="text-xs font-semibold px-2 py-1 rounded border border-current opacity-70 hover:opacity-100 transition-opacity">
                        Postop
                      </a>
                      <button
                        disabled={finalizing}
                        onClick={async () => {
                          setFinalizing(true)
                          try {
                            const res = await fetch(`/api/cases/${caseId}/finalize`, { method: "POST" })
                            if (res.ok) {
                              const body = await res.json().catch(() => null)
                              setData(prev => prev ? { ...prev, status: "COMPLETE", finalizedAt: body?.finalizedAt ?? new Date().toISOString() } : prev)
                              setShowPrintPrompt(true) // case finished → offer to print it
                            } else {
                              const body = await res.json().catch(() => ({}))
                              const REASON_LABELS: Record<string, string> = {
                                missing_technique:      "No anaesthesia technique recorded",
                                missing_postop:         "Post-op record not completed",
                                missing_aldrete:        "Aldrete score missing",
                                missing_disposition:    "Patient disposition not recorded",
                                missing_intraop:        "Intraop record not started",
                                missing_preop:          "Pre-op assessment missing",
                                invalid_intraop_times:  "End time is before start time",
                              }
                              const msg = body?.reason
                                ? (REASON_LABELS[body.reason] ?? body.reason)
                                : "Could not finalize — check all required fields are complete."
                              alert(msg)
                            }
                          } finally {
                            setFinalizing(false)
                          }
                        }}
                        className="text-xs font-bold px-3 py-1 rounded bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50 transition-colors">
                        {finalizing ? "Closing…" : "Close Now"}
                      </button>
                    </>
                  )}
                  {status === "COMPLETE" && withinUndoWindow && (
                    <button
                      onClick={async () => {
                        const res = await fetch(`/api/cases/${caseId}/unfinalize`, { method: "POST" })
                        if (res.ok) {
                          setData(prev => prev ? { ...prev, status: "IN_PROGRESS", finalizedAt: null } : prev)
                        }
                      }}
                      className="text-xs font-semibold px-3 py-1 rounded border border-amber-400 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors">
                      Unfinalize
                    </button>
                  )}
                  {status === "COMPLETE" && (
                    <a href={`/cases/${caseId}/print`}
                      className="text-xs font-bold px-3 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white transition-colors">
                      {L.printCase}
                    </a>
                  )}
                </div>
              </div>
            </div>
          )
        })()}

        {/* ═══════════════════════════════════════════════════════
            PAGE 1 — LANDSCAPE — INTRAOPERATIVE
        ════════════════════════════════════════════════════════ */}
        <div data-tour="summary-page1" className="page-intraop border border-slate-200 rounded-xl bg-white p-3 flex flex-col gap-2 min-h-[520px]">

          {/* Header — LOSPOR wordmark · procedure · institution/case block */}
          <div className="flex items-start justify-between border-b-2 border-blue-900 dark:border-blue-500 pb-2 gap-3">
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="text-[17px] font-black tracking-tight text-slate-900">LOSPOR</span>
                <span className="text-blue-800 dark:text-blue-400 text-[11px]">●</span>
                <span className="text-[11px] font-bold tracking-[0.18em] text-blue-900 dark:text-blue-300">{L.record}</span>
              </div>
              {p?.plannedProcedure && <div className="text-[13px] font-bold text-slate-900 mt-0.5">{p.plannedProcedure}</div>}
              {(p?.diagnosis || p?.icdCode) && (
                <div className="text-[9.5px] text-slate-500">{[p?.diagnosis, p?.icdCode].filter(Boolean).join(" · ")}</div>
              )}
            </div>
            <div className="text-right text-[9.5px] text-slate-500 leading-relaxed shrink-0">
              <div>{inst?.name}{inst?.city ? ` · ${inst.city}` : ""}</div>
              <div>{dateStr}</div>
              <div><span className="font-bold text-slate-800">{data.caseCode ? `Case ${data.caseCode}` : ""}</span>{isPrint ? `${data.caseCode ? " · " : ""}Page 1 of ${pageTotal}` : ""}</div>
            </div>
          </div>

          {/* Patient fill-in band — identity always blank, filled by hand */}
          <div className="border border-slate-200 rounded-lg bg-slate-50/60 dark:bg-[#181818] px-3 py-1.5 flex items-end gap-4">
            <div className="flex-1 min-w-0">
              <span className="text-[8.5px] text-slate-400">{L.patientName}</span>
              <div className="border-b border-slate-300 h-3.5" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-[8.5px] text-slate-400">{L.idFile}</span>
              <div className="border-b border-slate-300 h-3.5" />
            </div>
            <div className="shrink-0 text-[10px] font-bold text-slate-800 flex items-center gap-3 pb-0.5">
              {p?.ageYears != null && <span>{p.ageYears} {ageSuffix}</span>}
              {p?.sex && <span>{locale === "bg" ? (p.sex === "MALE" ? "Мъж" : p.sex === "FEMALE" ? "Жена" : "") : (p.sex === "MALE" ? "Male" : p.sex === "FEMALE" ? "Female" : "")}</span>}
              {p?.bloodType && <span>{p.bloodType} Rh{p.rhFactor === "POSITIVE" ? "+" : p.rhFactor === "NEGATIVE" ? "−" : ""}</span>}
              {p?.heightCm && p?.weightKg && <span>{p.heightCm} cm / {p.weightKg} kg</span>}
              {p?.bmi != null && <span>BMI {p.bmi}</span>}
              {p?.heightCm && p?.sex && (() => { const ibw = calcIBW(p.heightCm, p.sex); return ibw ? <span>IBW {ibw} kg</span> : null })()}
            </div>
          </div>

          {/* GDPR privacy strip — screen only; the print footer carries the disclaimer */}
          <div className="no-print text-[7.6px] text-amber-700 dark:text-amber-500 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded px-2 py-[3px]">{L.privacyNote}</div>

          {/* Key-facts chip row */}
          {(() => {
            const kf: string[] = []
            if (techniques.length) kf.push(techniques.map((t: string) => tLabel(TECHNIQUE_LABELS, t, locale)).join(" + "))
            const airway = deviceLabel(i, locale); if (airway && airway !== "—") kf.push(airway)
            if (airwayTools.length) kf.push(airwayTools.map((t: string) => tLabel(TOOL_LABELS, t, locale)).join(", "))
            const vent: string[] = []
            if (ventModes.length) vent.push(ventModes.join(", "))
            if (i?.peepCmH2O != null) vent.push(`PEEP ${i.peepCmH2O}`)
            if (vent.length) kf.push(vent.join(" · "))
            if (i?.volatileAgent) kf.push(i.volatileAgent)
            if (positions.length) kf.push(positions.map((s: string) => tLabel(POSITION_LABELS, s, locale)).join(" → "))
            if (duration()) kf.push(duration() as string)
            const access = vascular.map(a => `${a.siteLabel?.split(" › ").pop() ?? a.site ?? ""} ${a.size ?? ""}${a.sizeUnit ?? ""}`.trim()).filter(Boolean).join(" · ")
            const pill = "text-[8.8px] text-slate-700 border border-slate-300 rounded-full px-2.5 py-[2px] whitespace-nowrap"
            return (
              <div className="flex flex-wrap gap-1.5 items-center">
                {p?.asaScore && (
                  <span className="text-[8.8px] font-bold text-blue-900 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/40 border border-blue-200 dark:border-blue-800 rounded-full px-2.5 py-[2px]">
                    ASA {p.asaScore}{p.emergencySurgery ? "E" : ""}
                  </span>
                )}
                {kf.map((f, idx) => <span key={idx} className={pill}>{f}</span>)}
                {activeMonitors.length > 0 && <span className={pill}>Monitoring · {activeMonitors.join(" · ")}</span>}
                {access && <span className={pill}>IV access {access}</span>}
              </div>
            )
          })()}

          {/* Section label */}
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-bold tracking-[0.12em] text-blue-900 dark:text-blue-300">{L.intraopTt}</span>
            <div className="flex-1 h-px bg-blue-100 dark:bg-blue-900/60" />
          </div>

          {/* Timetable — stacked half-case panels at the same time scale.
              Numeric grid samples per panel; graph/drugs/events stay full-res. */}
          <div className="border border-slate-200 rounded-lg bg-white flex-1 min-h-0 overflow-hidden flex flex-col p-1 gap-0.5">
            {sheet0Panels.map(pl => (
              <div key={pl.index} className="flex-1 min-h-0">
                <PrintTimetable timetable={timetable} startISO={i?.startTime}
                  locale={locale} themeAware={!isPrint}
                  view={panelView(pl, sheet0Panels.length > 1)} />
              </div>
            ))}
            {(sheet0Panels.length > 1 || sheet0Panels[0].intervalMin > 5) && (
              <p className="text-[7.5px] text-slate-400 px-1.5 pb-0.5 shrink-0">
                {locale === "bg"
                  ? `Виталните в таблицата са през ${sheet0Panels[0].intervalMin} мин · графиката, лекарствата и събитията са в точно записаното време`
                  : `Vitals table sampled q${sheet0Panels[0].intervalMin}min · graph, drugs and events at exact recorded times`}
              </p>
            )}
          </div>

          {/* Bottom band: fluid balance · drug administration log · intraop notes */}
          <div className="grid grid-cols-[0.85fr_1.35fr_1fr] gap-2">
            <div className="border border-slate-200 rounded-lg p-2 bg-white">
              <p className="text-[8.5px] font-bold tracking-[0.1em] text-blue-900 dark:text-blue-300 mb-1.5">{L.fluidBal.toUpperCase()} (ML)</p>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { label: "Crystalloid", value: i?.crystalloidsMl },
                  { label: "Colloid",     value: i?.colloidsMl },
                  { label: "Blood",       value: i?.bloodMl },
                  { label: "Urine",       value: i?.urineMl },
                ].map(({ label, value }) => (
                  <div key={label} className="border border-slate-200 rounded-md text-center py-1">
                    <p className="text-[13px] font-extrabold text-slate-900 leading-tight">{value ?? "—"}</p>
                    <p className="text-[7.5px] text-slate-500">{label}</p>
                  </div>
                ))}
              </div>
              {i?.bloodProductsNote && <p className="text-[8px] text-slate-500 italic mt-1">{i.bloodProductsNote}</p>}
            </div>
            {/* Numbered log — the ① ② … pins on the chart resolve here */}
            <div className="border border-slate-200 rounded-lg p-2 bg-white">
              <p className="text-[8.5px] font-bold tracking-[0.1em] text-blue-900 dark:text-blue-300 mb-1.5">{L.drugLog.toUpperCase()}</p>
              {drugLog.length === 0 && <p className="text-[10px] text-slate-400">{L.noDrugs}</p>}
              <div className="grid grid-cols-2 gap-x-3">
                {drugLog.map(d => (
                  <div key={d.n} className="flex items-center gap-1.5 text-[8.5px] leading-[12px] min-w-0">
                    <span className="inline-flex items-center justify-center w-[11px] h-[11px] rounded-full border text-[6.8px] font-bold shrink-0"
                      style={{ color: d.color, borderColor: d.color }}>{d.n}</span>
                    <span className="font-bold text-slate-500 text-[8px]" style={{ fontFamily: "Consolas, monospace" }}>{d.time}</span>
                    <span className="text-slate-700 truncate flex-1">{d.name}</span>
                    <span className="font-bold text-slate-900 whitespace-nowrap" style={{ fontFamily: "Consolas, monospace" }}>{d.dose}</span>
                  </div>
                ))}
              </div>
              {(drugTotals.length > 0 || infTotals.length > 0) && (
                <p className="text-[7px] text-slate-500 border-t border-slate-100 dark:border-[#252525] mt-1 pt-0.5 leading-[9.5px]">
                  <span className="font-bold">{L.totalsLbl}:</span>{" "}
                  {[...drugTotals, ...infTotals].map(d => `${d.name} ${d.total} ${d.unit}`).join(" · ")}
                </p>
              )}
            </div>
            <div className="border border-slate-200 rounded-lg p-2 bg-white">
              <p className="text-[8.5px] font-bold tracking-[0.1em] text-blue-900 dark:text-blue-300 mb-1.5">{L.notes.toUpperCase()}</p>
              {i?.complications
                ? <p className="text-[9.5px] text-slate-700 leading-snug">{i.complications}</p>
                : <p className="text-[9.5px] text-slate-400">—</p>}
              {(i?.premedicationEvening || i?.premedicationMorning) && (
                <p className="text-[8px] text-slate-500 mt-1">
                  {L.premed}: {[i?.premedicationEvening && `${L.evening} ${i.premedicationEvening}`, i?.premedicationMorning && `${L.morning} ${i.premedicationMorning}`].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>
          </div>

          {/* Signatures */}
          <div className="grid grid-cols-3 gap-8 mt-1">
            {[L.sigAnest, L.sigNurse, L.sigSurg].map(r => (
              <div key={r} className="border-t border-slate-300 pt-1"><p className="text-[8.5px] text-slate-400">{r} — {L.nameSig}</p></div>
            ))}
          </div>

          {/* Footer */}
          <div className="flex justify-between text-[7.5px] text-slate-400 border-t border-slate-200 pt-1">
            <span>{L.footerLine}</span>
            <span>{L.generatedLbl} {format(new Date(), "dd MMM yyyy")}</span>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════
            CONTINUATION SHEETS — only for extreme (>~24h) cases
        ════════════════════════════════════════════════════════ */}
        {contSheets.map((sheetPanels, k) => (
          <div key={`cont-${k}`} className="page-intraop border border-slate-200 rounded-xl bg-white p-3 flex flex-col gap-2 min-h-[520px]">
            {/* Compact continued strip — identity fields live on Sheet 1 */}
            <div className="flex items-center justify-between border-b-2 border-blue-900 dark:border-blue-500 pb-1.5 gap-3">
              <div className="flex items-baseline gap-2 min-w-0">
                <span className="text-[13px] font-black tracking-tight text-slate-900">LOSPOR</span>
                <span className="text-[9.5px] font-bold tracking-[0.14em] text-blue-900 dark:text-blue-300">{L.record} · {contWord}</span>
                <span className="text-[9px] text-slate-500 truncate">
                  {[patientLine, p?.asaScore ? `ASA ${p.asaScore}${p.emergencySurgery ? "E" : ""}` : null,
                    techniques.length ? techniques.map((t: string) => tLabel(TECHNIQUE_LABELS, t, locale)).join(" + ") : null,
                    locale === "bg" ? "самоличността — на лист 1" : "identity fields on Sheet 1"].filter(Boolean).join(" · ")}
                </span>
              </div>
              <div className="text-right text-[9px] text-slate-500 shrink-0">
                <span className="font-bold text-slate-800">{colHHMM(sheetPanels[0].startCol)} – {colHHMM(sheetPanels[sheetPanels.length - 1].endCol + 1)}</span>
                {" · "}{locale === "bg" ? "витални" : "vitals"} q{sheetPanels[0].intervalMin}min · {data.caseCode ? `Case ${data.caseCode} · ` : ""}{locale === "bg" ? `Стр. ${k + 2} от ${pageTotal}` : `Page ${k + 2} of ${pageTotal}`}
              </div>
            </div>

            <div className="border border-slate-200 rounded-lg bg-white flex-1 min-h-0 overflow-hidden flex flex-col p-1 gap-0.5">
              {sheetPanels.map(pl => (
                <div key={pl.index} className="flex-1 min-h-0">
                  <PrintTimetable timetable={timetable} startISO={i?.startTime}
                    locale={locale} themeAware={!isPrint} view={panelView(pl, true)} />
                </div>
              ))}
            </div>

            {/* Signatures only on the final continuation sheet */}
            {k === contSheets.length - 1 && (
              <div className="grid grid-cols-3 gap-8">
                {[L.sigAnest, L.sigNurse, L.sigSurg].map(rr => (
                  <div key={rr} className="border-t border-slate-300 pt-1"><p className="text-[8.5px] text-slate-400">{rr} — {L.nameSig}</p></div>
                ))}
              </div>
            )}
            <div className="flex justify-between text-[7.5px] text-slate-400 border-t border-slate-200 pt-1">
              <span>{L.footerLine}</span>
              <span>{k < contSheets.length - 1 ? (locale === "bg" ? `Продължава на лист ${k + 3} · ` : `Continues on Sheet ${k + 3} · `) : ""}{L.generatedLbl} {format(new Date(), "dd MMM yyyy")}</span>
            </div>
          </div>
        ))}

        {/* ═══════════════════════════════════════════════════════
            PAGE 2 — PORTRAIT — PREOP + POSTOP
        ════════════════════════════════════════════════════════ */}
        <div data-tour="summary-page2" className="page-preoppost border border-slate-200 rounded-xl bg-white p-3 flex flex-col gap-2 min-h-[520px]">

          {/* Header — same wordmark system as Sheet 1 */}
          <div className="flex items-start justify-between border-b-2 border-blue-900 dark:border-blue-500 pb-2 gap-3">
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="text-[17px] font-black tracking-tight text-slate-900">LOSPOR</span>
                <span className="text-blue-800 dark:text-blue-400 text-[11px]">●</span>
                <span className="text-[11px] font-bold tracking-[0.18em] text-blue-900 dark:text-blue-300">{L.prepost}</span>
              </div>
              {p?.plannedProcedure && <div className="text-[13px] font-bold text-slate-900 mt-0.5">{p.plannedProcedure}</div>}
              {(p?.diagnosis || p?.icdCode) && (
                <div className="text-[9.5px] text-slate-500">{[p?.diagnosis, p?.icdCode].filter(Boolean).join(" · ")}</div>
              )}
            </div>
            <div className="text-right text-[9.5px] text-slate-500 leading-relaxed shrink-0">
              <div>{inst?.name}{inst?.city ? ` · ${inst.city}` : ""}</div>
              <div>{dateStr}</div>
              <div><span className="font-bold text-slate-800">{data.caseCode ? `Case ${data.caseCode}` : ""}</span>{isPrint ? `${data.caseCode ? " · " : ""}Page ${pageTotal} of ${pageTotal}` : ""}</div>
            </div>
          </div>

          {/* PREOPERATIVE ASSESSMENT */}
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-bold tracking-[0.12em] text-blue-900 dark:text-blue-300">{L.preopAssessment}</span>
            <div className="flex-1 h-px bg-blue-100 dark:bg-blue-900/60" />
          </div>
          <div className="grid grid-cols-4 gap-2">
            {/* Risk scores + preop vitals */}
            <div className="border border-slate-200 rounded-lg p-2 bg-white">
              <p className="text-[8.5px] font-bold tracking-[0.1em] text-blue-900 dark:text-blue-300 mb-1">{L.riskScores.toUpperCase()}</p>
              <F label="ASA"       value={p?.asaScore ? `Class ${p.asaScore}${p.emergencySurgery ? "E" : ""}` : null} />
              {p?.rcriScore  != null && <F label="RCRI"      value={`${p.rcriScore} / 6 — ${rcriRiskLabel(p.rcriScore)}`} />}
              {p?.apfelScore != null && <F label="Apfel"     value={`${p.apfelScore} / 4 — ${apfelRiskLabel(p.apfelScore)}`} />}
              {p?.stopBangScore != null && <F label="STOP-BANG" value={`${p.stopBangScore} / 8 — ${stopBangRiskLabel(p.stopBangScore)}`} />}
              <p className="text-[8.5px] font-bold tracking-[0.1em] text-blue-900 dark:text-blue-300 mb-1 mt-2">{L.preVitals.toUpperCase()}</p>
              <F label={L.bp}   value={p?.bpSystolic && p?.bpDiastolic ? `${p.bpSystolic} / ${p.bpDiastolic} mmHg` : null} />
              <F label={L.hr}   value={p?.heartRate ? `${p.heartRate} bpm` : null} />
              <F label="SpO₂"   value={p?.spO2 ? `${p.spO2} %` : null} />
              <F label={L.temp} value={p?.temperature ? `${p.temperature} °C` : null} />
              <F label={L.rr}   value={p?.respiratoryRate ? `${p.respiratoryRate}/min` : null} />
            </div>
            {/* Airway + anthropometry */}
            <div className="border border-slate-200 rounded-lg p-2 bg-white">
              <p className="text-[8.5px] font-bold tracking-[0.1em] text-blue-900 dark:text-blue-300 mb-1">{L.airwayAssessment.toUpperCase()}</p>
              <F label="Mallampati"      value={p?.mallampati} />
              <F label={L.mouthOpening}  value={p?.mouthOpeningCm ? `${p.mouthOpeningCm} cm` : null} />
              <F label={L.thyromental}   value={p?.thyromental ? `${p.thyromental} cm` : null} />
              <F label={L.neckMobility}  value={p?.neckMobility} />
              <F label="ULBT"            value={p?.upperLipBiteTest} />
              <F label={L.clGrade}       value={p?.cormackLehane} />
              {p?.difficultAirwayHistory
                ? <p className="text-[8.5px] font-semibold text-red-700 bg-red-50 rounded px-1.5 py-0.5 mt-1.5 inline-block">{L.difficultAirway}{p.difficultAirwayNotes ? ": " + p.difficultAirwayNotes : ""}</p>
                : <p className="text-[8.5px] font-medium text-green-700 bg-green-50 rounded px-1.5 py-0.5 mt-1.5 inline-block">No difficult-airway history</p>}
              <p className="text-[8.5px] font-bold tracking-[0.1em] text-blue-900 dark:text-blue-300 mb-1 mt-2">{L.anthropometry.toUpperCase()}</p>
              <F label={L.heightWeight} value={p?.heightCm && p?.weightKg ? `${p.heightCm} cm / ${p.weightKg} kg` : null} />
              <F label="BMI"           value={p?.bmi ? `${p.bmi} kg/m²` : null} />
            </div>
            {/* History & comorbidities + meds + allergies */}
            <div className="border border-slate-200 rounded-lg p-2 bg-white">
              <p className="text-[8.5px] font-bold tracking-[0.1em] text-blue-900 dark:text-blue-300 mb-1">{L.histCom.toUpperCase()}</p>
              {comorbidities.length > 0 && (
                <div className="flex flex-wrap mb-1">{comorbidities.map((c, idx) => <Chip key={idx} color="amber">{c.label ?? String(c)}</Chip>)}</div>
              )}
              {currentMedicationsText && (
                <>
                  <p className="text-[8.5px] font-bold tracking-[0.1em] text-blue-900 dark:text-blue-300 mb-1 mt-1.5">{L.medications.toUpperCase()}</p>
                  <p className="text-[9.5px] text-slate-700 leading-snug">{currentMedicationsText}</p>
                </>
              )}
              <p className="text-[8.5px] font-bold tracking-[0.1em] text-red-800 mb-0.5 mt-1.5">{L.allergies.toUpperCase()}</p>
              {(p?.allergies || p?.latexAllergy) ? (
                <>
                  {allergyDetailsText && <p className="text-[9.5px] font-bold text-red-700">{allergyDetailsText}</p>}
                  {p?.latexAllergy   && <p className="text-[9px] text-red-600">{L.latexAllergy}</p>}
                </>
              ) : <p className="text-[9px] text-slate-500">NKDA</p>}
              {p?.familyAnesthesiaProblems && (
                <p className="text-[8.5px] text-amber-700 mt-1.5">{L.familyHistory}</p>
              )}
            </div>
            {/* Investigations */}
            <div className="border border-slate-200 rounded-lg p-2 bg-white">
              <p className="text-[8.5px] font-bold tracking-[0.1em] text-blue-900 dark:text-blue-300 mb-1">{L.investigations.toUpperCase()}</p>
              {labResults.length > 0 ? (
                <div
                  className={labResults.length >= 12 ? "lab-compact" : ""}
                  style={{ columns: labResults.length >= 24 ? 2 : 1, columnGap: "0.5rem" }}
                >
                  {labResults.map((l, idx) => (
                    <div key={idx} className="lab-entry" style={{ breakInside: "avoid" }}>
                      <F label={l.test ?? ""} value={`${l.value}${l.unit ? " " + l.unit : ""}`} />
                    </div>
                  ))}
                </div>
              ) : <p className="text-[9px] text-slate-400">—</p>}
            </div>
          </div>

          {/* POSTOPERATIVE RECOVERY */}
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[9px] font-bold tracking-[0.12em] text-blue-900 dark:text-blue-300">{L.postopRecoveryLbl}</span>
            <div className="flex-1 h-px bg-blue-100 dark:bg-blue-900/60" />
          </div>
          <div className="grid grid-cols-6 gap-2">
            {[
              ["Activity",      o?.aldreteActivity],
              ["Respiration",   o?.aldreteRespiration],
              ["Circulation",   o?.aldreteCirculation],
              ["Consciousness", o?.aldreteConsciousness],
              ["SpO₂",          o?.aldreteSpO2],
            ].map(([lbl, val]) => (
              <div key={lbl as string} className="border border-slate-200 rounded-lg text-center py-1.5 bg-white">
                <p className="text-[8px] text-slate-500">{lbl as string}</p>
                <p className="text-[15px] font-extrabold text-slate-900 leading-tight">{val ?? "—"}</p>
              </div>
            ))}
            <div className={`border rounded-lg text-center py-1.5 ${aldreteBg}`}>
              <p className="text-[8px] font-medium">{L.aldreteTotalLbl}</p>
              <p className="text-[15px] font-extrabold leading-tight">{o?.aldreteTotal ?? "—"} / 10</p>
              <p className="text-[7px]">{aldreteTotal >= 9 ? L.readyDischarge : aldreteTotal >= 7 ? L.monitor : L.continueStr}</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 flex-1 min-h-0">
            <div className="border border-slate-200 rounded-lg p-2 bg-white">
              <p className="text-[8.5px] font-bold tracking-[0.1em] text-blue-900 dark:text-blue-300 mb-1">{L.recoveryObs.toUpperCase()}</p>
              <F label={L.bp} value={o?.recoveryBpSystolic != null && o?.recoveryBpDiastolic != null ? `${o.recoveryBpSystolic} / ${o.recoveryBpDiastolic} mmHg` : null} />
              <F label={L.hr} value={o?.recoveryHeartRate != null ? `${o.recoveryHeartRate} bpm` : null} />
              <F label="SpO₂" value={o?.recoverySpO2 != null ? `${o.recoverySpO2} %` : null} />
              <F label={L.temperature} value={o?.temperatureCelsius ? `${o.temperatureCelsius} °C` : null} />
              <F label={L.painNRS}     value={o?.painScoreNRS != null ? `${o.painScoreNRS} / 10` : null} />
              <F label={L.ponv}        value={o?.ponv ? "Yes" : o?.ponv === false ? "None" : null} />
            </div>
            <div className="border border-slate-200 rounded-lg p-2 bg-white">
              <p className="text-[8.5px] font-bold tracking-[0.1em] text-blue-900 dark:text-blue-300 mb-1.5">{L.disposition.toUpperCase()}</p>
              {o?.disposition && (
                <span className={`inline-block text-[11px] font-extrabold px-3 py-0.5 rounded-md border mb-1.5 ${
                  o.disposition === "WARD" ? "bg-green-100 text-green-800 border-green-300" :
                  o.disposition === "PACU" ? "bg-amber-100 text-amber-800 border-amber-300" :
                  "bg-red-100 text-red-800 border-red-300"
                }`}>{o.disposition}</span>
              )}
              {o?.dispositionNotes && <p className="text-[9.5px] text-slate-700 leading-snug">{o.dispositionNotes}</p>}
            </div>
            <div className="border border-slate-200 rounded-lg p-2 bg-white">
              <p className="text-[8.5px] font-bold tracking-[0.1em] text-blue-900 dark:text-blue-300 mb-1.5">{L.handover.toUpperCase()}</p>
              <div className="flex flex-wrap gap-1">
                {handoverItems.length > 0 ? handoverItems.map((code: string, idx: number) => (
                  <span key={idx} className="text-[8.5px] text-green-800 bg-green-50 border border-green-200 rounded px-1.5 py-[1.5px]">
                    ✓ {handoverLookup[code] ?? code.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}
                  </span>
                )) : <p className="text-[9px] text-slate-400">—</p>}
              </div>
            </div>
          </div>

          {/* Signatures */}
          <div className="grid grid-cols-3 gap-8 mt-1">
            {[L.sigAnest, L.sigNurse, L.sigSurg].map(r => (
              <div key={r} className="border-t border-slate-300 pt-1"><p className="text-[8.5px] text-slate-400">{r} — {L.nameSig}</p></div>
            ))}
          </div>
          <div className="flex justify-between text-[7.5px] text-slate-400 border-t border-slate-200 pt-1">
            <span>{L.footerLine}</span>
            <span>{L.generatedLbl} {format(new Date(), "dd MMM yyyy")}</span>
          </div>
        </div>

        {/* Print-only disclaimer footer — summary mode only. In print mode the
            sheets are exact A4 pages with their own footers; any content after
            the last sheet would spill onto a blank extra page. */}
        {!isPrint && (
          <div className="print-only hidden" style={{ display: "none" }}>
            <style>{`@media print { .lospor-print-disclaimer { display: block !important; } }`}</style>
            <p className="lospor-print-disclaimer text-[7px] text-center text-slate-400 mt-2 border-t border-slate-200 pt-1">
              LOSPOR — Personal anaesthetic case log. Not a clinical record. Patient identifiers must not be added. © 2026 Kaloyan Dzhunov · AGPL-3.0
            </p>
          </div>
        )}
      </div>
    </>
  )
}
