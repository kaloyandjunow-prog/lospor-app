// Seed the LabLoinc table with LOINC codes for the 67-test canonical lab library.
// Run: npx tsx scripts/seed-lab-loinc.ts
// Idempotent (upsert by name).

import "dotenv/config"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter } as any)

const LAB_LOINC: {
  name: string; loincCode: string; unitCanon: string
  referenceLow?: number; referenceHigh?: number
}[] = [
  // Haematology
  { name: "Haemoglobin (Hb)",        loincCode: "718-7",    unitCanon: "g/L",          referenceLow: 120,  referenceHigh: 175   },
  { name: "Haematocrit (Hct)",        loincCode: "4544-3",   unitCanon: "%",             referenceLow: 36,   referenceHigh: 52    },
  { name: "Erythrocytes (RBC)",       loincCode: "789-8",    unitCanon: "×10¹²/L",      referenceLow: 3.8,  referenceHigh: 5.8   },
  { name: "Leucocytes (WBC)",         loincCode: "6690-2",   unitCanon: "×10⁹/L",       referenceLow: 4,    referenceHigh: 11    },
  { name: "Platelets",                loincCode: "777-3",    unitCanon: "×10⁹/L",       referenceLow: 150,  referenceHigh: 400   },
  { name: "MCV",                      loincCode: "787-2",    unitCanon: "fL",            referenceLow: 80,   referenceHigh: 100   },
  { name: "MCH",                      loincCode: "785-6",    unitCanon: "pg",            referenceLow: 27,   referenceHigh: 33    },
  { name: "MCHC",                     loincCode: "786-4",    unitCanon: "g/L",           referenceLow: 320,  referenceHigh: 360   },
  { name: "Neutrophils",              loincCode: "770-8",    unitCanon: "%",             referenceLow: 40,   referenceHigh: 75    },
  { name: "Lymphocytes",              loincCode: "736-9",    unitCanon: "%",             referenceLow: 20,   referenceHigh: 45    },
  { name: "Monocytes",                loincCode: "742-7",    unitCanon: "%",             referenceLow: 2,    referenceHigh: 10    },
  { name: "Eosinophils",              loincCode: "713-8",    unitCanon: "%",             referenceLow: 1,    referenceHigh: 6     },
  { name: "Reticulocytes",            loincCode: "415-0",    unitCanon: "%",             referenceLow: 0.5,  referenceHigh: 2.5   },
  // Coagulation
  { name: "PT (Prothrombin time)",    loincCode: "5902-2",   unitCanon: "s",             referenceLow: 11,   referenceHigh: 15    },
  { name: "INR",                      loincCode: "6301-6",   unitCanon: "",              referenceLow: 0.8,  referenceHigh: 1.2   },
  { name: "aPTT",                     loincCode: "3173-2",   unitCanon: "s",             referenceLow: 25,   referenceHigh: 38    },
  { name: "Fibrinogen",               loincCode: "3255-7",   unitCanon: "g/L",           referenceLow: 2,    referenceHigh: 4     },
  { name: "D-dimer",                  loincCode: "48066-5",  unitCanon: "mg/L FEU",                          referenceHigh: 0.5   },
  { name: "Thrombin time (TT)",       loincCode: "3243-3",   unitCanon: "s",             referenceLow: 14,   referenceHigh: 19    },
  { name: "Anti-Xa",                  loincCode: "3179-9",   unitCanon: "IU/mL"                                                   },
  // Electrolytes
  { name: "Sodium (Na⁺)",            loincCode: "2951-2",   unitCanon: "mmol/L",        referenceLow: 136,  referenceHigh: 145   },
  { name: "Potassium (K⁺)",          loincCode: "2823-3",   unitCanon: "mmol/L",        referenceLow: 3.5,  referenceHigh: 5.1   },
  { name: "Chloride (Cl⁻)",          loincCode: "2075-0",   unitCanon: "mmol/L",        referenceLow: 98,   referenceHigh: 107   },
  { name: "Bicarbonate (HCO₃⁻)",     loincCode: "1963-8",   unitCanon: "mmol/L",        referenceLow: 22,   referenceHigh: 29    },
  { name: "Calcium (Ca²⁺)",          loincCode: "17861-6",  unitCanon: "mmol/L",        referenceLow: 2.15, referenceHigh: 2.55  },
  { name: "Ionised Ca²⁺",            loincCode: "1994-3",   unitCanon: "mmol/L",        referenceLow: 1.15, referenceHigh: 1.35  },
  { name: "Magnesium (Mg²⁺)",        loincCode: "2601-3",   unitCanon: "mmol/L",        referenceLow: 0.7,  referenceHigh: 1.0   },
  { name: "Phosphate",                loincCode: "2777-1",   unitCanon: "mmol/L",        referenceLow: 0.8,  referenceHigh: 1.5   },
  // Biochemistry
  { name: "Creatinine",               loincCode: "14682-9",  unitCanon: "μmol/L",        referenceLow: 44,   referenceHigh: 115   },
  { name: "eGFR",                     loincCode: "62238-1",  unitCanon: "mL/min/1.73m²", referenceLow: 60                         },
  { name: "Urea (BUN)",               loincCode: "3094-0",   unitCanon: "mmol/L",        referenceLow: 2.5,  referenceHigh: 7.8   },
  { name: "Glucose",                  loincCode: "2345-7",   unitCanon: "mmol/L",        referenceLow: 3.9,  referenceHigh: 6.1   },
  { name: "HbA1c",                    loincCode: "4548-4",   unitCanon: "%",                                  referenceHigh: 6.5   },
  { name: "Lactate",                  loincCode: "2524-7",   unitCanon: "mmol/L",        referenceLow: 0.5,  referenceHigh: 2.2   },
  { name: "Uric acid",                loincCode: "3084-1",   unitCanon: "μmol/L",        referenceLow: 202,  referenceHigh: 416   },
  { name: "Total protein",            loincCode: "2885-2",   unitCanon: "g/L",           referenceLow: 64,   referenceHigh: 83    },
  { name: "Albumin",                  loincCode: "1751-7",   unitCanon: "g/L",           referenceLow: 35,   referenceHigh: 52    },
  // Liver
  { name: "ALT (SGPT)",               loincCode: "1742-6",   unitCanon: "U/L",                                referenceHigh: 56    },
  { name: "AST (SGOT)",               loincCode: "1920-8",   unitCanon: "U/L",                                referenceHigh: 40    },
  { name: "ALP",                      loincCode: "6768-6",   unitCanon: "U/L",           referenceLow: 44,   referenceHigh: 147   },
  { name: "GGT",                      loincCode: "2324-2",   unitCanon: "U/L",                                referenceHigh: 55    },
  { name: "Total bilirubin",          loincCode: "1975-2",   unitCanon: "μmol/L",                             referenceHigh: 21    },
  { name: "Direct bilirubin",         loincCode: "14631-6",  unitCanon: "μmol/L",                             referenceHigh: 5     },
  { name: "Total bile acids",         loincCode: "30239-8",  unitCanon: "μmol/L",                             referenceHigh: 10    },
  // Cardiac
  { name: "Troponin I (hs-cTnI)",     loincCode: "89579-7",  unitCanon: "ng/L",                               referenceHigh: 26    },
  { name: "Troponin T (hs-cTnT)",     loincCode: "67151-1",  unitCanon: "ng/L",                               referenceHigh: 14    },
  { name: "CK (Creatine kinase)",     loincCode: "2157-6",   unitCanon: "U/L",                                referenceHigh: 200   },
  { name: "CK-MB",                    loincCode: "12187-7",  unitCanon: "U/L",                                referenceHigh: 25    },
  { name: "BNP",                      loincCode: "42637-9",  unitCanon: "pg/mL",                              referenceHigh: 100   },
  { name: "NT-proBNP",                loincCode: "33762-6",  unitCanon: "pg/mL",                              referenceHigh: 125   },
  { name: "Myoglobin",                loincCode: "2154-3",   unitCanon: "μg/L",                               referenceHigh: 90    },
  // Blood Gas (BGA: mmHg per project decision)
  { name: "pH",                       loincCode: "2744-1",   unitCanon: "",              referenceLow: 7.35, referenceHigh: 7.45  },
  { name: "PaO₂",                     loincCode: "2703-7",   unitCanon: "mmHg",          referenceLow: 80,   referenceHigh: 100   },
  { name: "PaCO₂",                    loincCode: "2019-8",   unitCanon: "mmHg",          referenceLow: 35,   referenceHigh: 45    },
  { name: "HCO₃⁻ (ABG)",             loincCode: "1960-4",   unitCanon: "mmol/L",        referenceLow: 22,   referenceHigh: 26    },
  { name: "Base excess (BE)",         loincCode: "1925-7",   unitCanon: "mmol/L",        referenceLow: -2,   referenceHigh: 2     },
  { name: "SaO₂",                     loincCode: "2708-6",   unitCanon: "%",             referenceLow: 94,   referenceHigh: 99    },
  { name: "Lactate (ABG)",            loincCode: "32693-4",  unitCanon: "mmol/L",        referenceLow: 0.5,  referenceHigh: 2.0   },
  // Thyroid
  { name: "TSH",                      loincCode: "3016-3",   unitCanon: "mIU/L",         referenceLow: 0.4,  referenceHigh: 4.0   },
  { name: "Free T4 (fT4)",            loincCode: "3024-7",   unitCanon: "pmol/L",        referenceLow: 12,   referenceHigh: 22    },
  { name: "Free T3 (fT3)",            loincCode: "3051-0",   unitCanon: "pmol/L",        referenceLow: 3.5,  referenceHigh: 6.5   },
  // Inflammatory
  { name: "CRP",                      loincCode: "1988-5",   unitCanon: "mg/L",                               referenceHigh: 10    },
  { name: "ESR",                      loincCode: "4537-7",   unitCanon: "mm/h",                               referenceHigh: 20    },
  { name: "Ferritin",                 loincCode: "2276-4",   unitCanon: "μg/L",          referenceLow: 12,   referenceHigh: 300   },
  { name: "Procalcitonin (PCT)",      loincCode: "75241-0",  unitCanon: "μg/L",                               referenceHigh: 0.25  },
  { name: "IL-6",                     loincCode: "26881-3",  unitCanon: "pg/mL",                              referenceHigh: 7     },
]

async function main() {
  console.log(`Seeding ${LAB_LOINC.length} LabLoinc entries...`)
  let upserted = 0
  for (const row of LAB_LOINC) {
    await prisma.labLoinc.upsert({
      where:  { name: row.name },
      update: { loincCode: row.loincCode, unitCanon: row.unitCanon, referenceLow: row.referenceLow ?? null, referenceHigh: row.referenceHigh ?? null },
      create: { name: row.name, loincCode: row.loincCode, unitCanon: row.unitCanon, referenceLow: row.referenceLow ?? null, referenceHigh: row.referenceHigh ?? null },
    })
    upserted++
  }
  console.log(`Done. ${upserted} rows upserted.`)
}

main().catch(console.error).finally(() => prisma.$disconnect())
