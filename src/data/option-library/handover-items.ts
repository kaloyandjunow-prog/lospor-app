// HANDOVER_ITEM — postop handover checklist, tree-shaped like TECHNIQUE/
// VASCULAR_ACCESS (group rows as parents, item rows as children). Replaces
// PostopForm.tsx's HANDOVER_GROUPS_EN/BG and mobile's matching hardcoded copy.
import type { TreeNode } from "./types"

export const HANDOVER_ITEMS: TreeNode[] = [
  { v: "VITAL_SIGNS_MONITORING", label: "Vital Signs & Monitoring", labelBg: "Витални показатели и мониториране", children: [
    { v: "obs_freq", label: "Observations q15 min × 1h, then q30 min × 1h", labelBg: "Мониториране на 15 мин × 1ч, след това на 30 мин" },
    { v: "spo2_cont", label: "Continuous SpO₂ monitoring", labelBg: "Непрекъснато мониториране на SpO₂" },
    { v: "alert_bp", label: "Blood pressure — target range communicated", labelBg: "АН — целеви диапазон е съобщен" },
    { v: "temp_monitor", label: "Temperature monitoring / active warming", labelBg: "Контрол на температурата / активно затопляне" },
    { v: "urine_output", label: "Urine output monitoring (IDC in situ)", labelBg: "Мониториране на диурезата (уринарен катетър)" },
    { v: "glucose", label: "Serum/peripheral glucose monitoring", labelBg: "Мониториране на серумна/периферна глюкоза" },
  ]},
  { v: "AIRWAY_OXYGEN", label: "Airway & Oxygen", labelBg: "Дихателни пътища и кислород", children: [
    { v: "o2_supp", label: "Supplemental O₂ — rate and duration specified", labelBg: "Кислородотерапия — скорост и продължителност са уточнени" },
    { v: "npo", label: "Fasting status / nil by mouth until fully awake", labelBg: "Режим на гладуване / хранене е уточнен" },
    { v: "diet_advance", label: "Advance diet when tolerating", labelBg: "Захранване при поносимост" },
    { v: "alert_resp", label: "Alert if SpO₂ < 92% or RR < 8 or > 25/min", labelBg: "Сигнализирай при SpO₂ < 92% или ДЧ < 8 или > 25/мин" },
    { v: "airway_alert", label: "Difficult airway — alert at bedside", labelBg: "Труден дихателен път — сигнализирай при нужда" },
    { v: "airway_position", label: "Position: head up / lateral / as specified", labelBg: "Позиция: повдигнат горен край / странично / по предписание" },
  ]},
  { v: "CARDIOVASCULAR", label: "Cardiovascular", labelBg: "Сърдечно-съдова система", children: [
    { v: "piv", label: "Peripheral IV in situ", labelBg: "Периферен венозен катетър (ПВК)" },
    { v: "cvk", label: "Central venous catheter in situ", labelBg: "Централен венозен катетър (ЦВК)" },
    { v: "art_line", label: "Arterial line in situ", labelBg: "Артериална линия" },
    { v: "alert_hr", label: "Alert if HR < 50 or > 120 bpm", labelBg: "Сигнализирай при СЧ < 50 или > 120 уд/мин" },
    { v: "fluid_plan", label: "IV fluid plan — type, rate, volume specified", labelBg: "План за венозни течности — вид, скорост, обем е уточнен" },
    { v: "fluid_balance", label: "Fluid balance monitoring and documentation", labelBg: "Мониториране и документиране на воден баланс" },
    { v: "antihypertensive", label: "Antihypertensive medications resumed / held", labelBg: "Антихипертензивни медикаменти — подновени / задържани" },
    { v: "anticoagulation", label: "Anticoagulation plan documented", labelBg: "План за антикоагулация е документиран" },
  ]},
  { v: "PAIN", label: "Pain", labelBg: "Обезболяване", children: [
    { v: "analgesia_protocol", label: "Regular analgesic schedule prescribed", labelBg: "Редовна аналгезия по протокол" },
    { v: "pca", label: "PCA / epidural — pump settings checked", labelBg: "ПКА / епидурал — настройките на помпата са проверени" },
    { v: "epidural_catheter", label: "Epidural catheter — pain team to review", labelBg: "Епидурален катетър — за преглед от екип по болкова терапия" },
    { v: "nerve_catheter", label: "Peripheral nerve catheter in situ", labelBg: "Периферен нервен катетър" },
    { v: "pain_rescue", label: "Rescue analgesia — drug, dose, frequency", labelBg: "Резервна аналгезия — медикамент, доза, честота" },
    { v: "alert_pain", label: "Alert if NRS pain score > 4 at rest", labelBg: "Сигнализирай при NRS > 4 в покой" },
  ]},
  { v: "PONV_GI", label: "PONV & GI", labelBg: "ПОНВ и стомашно-чревна система", children: [
    { v: "antiemetic_prn", label: "Antiemetics PRN / antiemetic regime prescribed", labelBg: "Антиеметици при нужда / схема е предписана" },
    { v: "ponv_protocol", label: "PONV prophylaxis", labelBg: "Профилактика на ПОНВ" },
    { v: "oral_intake", label: "Resume oral intake when tolerating", labelBg: "Захранване при поносимост" },
    { v: "ngt", label: "NGT in situ — position confirmed / output documented", labelBg: "НГС — позицията е потвърдена / отделянето е документирано" },
  ]},
  { v: "MEDICATIONS_PROPHYLAXIS", label: "Medications & Prophylaxis", labelBg: "Медикаменти и профилактика", children: [
    { v: "resume_meds", label: "Regular medications resumed / held — list confirmed", labelBg: "Редовните медикаменти са подновени / задържани — списъкът е потвърден" },
    { v: "dvt_lmwh", label: "Chemical DVT prophylaxis — LMWH dose and timing", labelBg: "Медикаментозна ДВТ профилактика — НМХ доза и час" },
    { v: "dvt_mechanical", label: "Mechanical DVT prophylaxis — compression stockings / IPC", labelBg: "Механична ДВТ профилактика — чорапи / пневматична компресия" },
    { v: "mobilisation", label: "Early mobilisation plan documented", labelBg: "Ранна мобилизация е планирана" },
    { v: "stress_ulcer", label: "Stress ulcer prophylaxis", labelBg: "Профилактика на стрес-язва" },
    { v: "antibiotics", label: "Antibiotics per surgical plan / course continued", labelBg: "Антибиотичен курс е продължен / завършен" },
    { v: "insulin", label: "Insulin / diabetic management protocol active", labelBg: "Инсулин / диабетен протокол е активен" },
    { v: "steroids", label: "Steroid supplementation if applicable", labelBg: "Кортикостероидна суплементация при необходимост" },
  ]},
  { v: "INVESTIGATIONS", label: "Investigations", labelBg: "Изследвания", children: [
    { v: "bloods", label: "Blood tests in ___ hours", labelBg: "Кръвни изследвания след ___ часа" },
    { v: "ecg", label: "12-lead ECG", labelBg: "12-отвеждащ ЕКГ" },
    { v: "cxr", label: "Chest X-ray / pending imaging follow-up", labelBg: "Образни изследвания — проследяването е организирано" },
  ]},
  { v: "CONSULTATIONS_FOLLOWUP", label: "Consultations & Follow-up", labelBg: "Консултации и проследяване", children: [
    { v: "pain_team", label: "Pain management team review", labelBg: "Преглед от екип по болкова терапия" },
    { v: "physio", label: "Physiotherapy", labelBg: "Физиотерапия" },
    { v: "dietitian", label: "Dietitian / nutritional support", labelBg: "Диетолог / нутритивна подкрепа" },
    { v: "wound_care", label: "Wound / drain care instructions documented", labelBg: "Инструкции за грижа за раната / дренажа са документирани" },
    { v: "follow_up", label: "Follow-up appointment / plan communicated", labelBg: "Контролен преглед / план е съобщен" },
  ]},
]
