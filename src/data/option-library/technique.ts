// TECHNIQUE — anaesthesia technique tree (TechniqueTree.tsx TREE).
import type { TreeNode } from "./types"

export const TECHNIQUE_TREE: TreeNode[] = [
  { v: "GENERAL", label: "General Anaesthesia", children: [
    { v: "GENERAL_INHALATION", label: "Inhalational" }, { v: "GENERAL_TIVA", label: "TIVA" }, { v: "GENERAL_BALANCED", label: "Balanced (inhaled + IV)" },
  ]},
  { v: "REGIONAL", label: "Regional Anaesthesia", children: [
    { v: "NEURAXIAL", label: "Neuraxial", children: [
      { v: "SPINAL", label: "Spinal (SAB)", children: [
        { v: "SPINAL_SINGLE", label: "Single shot", children: [
          { v: "SPINAL_SINGLE_LUMBAR", label: "Lumbar" }, { v: "SPINAL_SINGLE_LOW_THORACIC", label: "Low thoracic" },
          { v: "SPINAL_SINGLE_MID_THORACIC", label: "Mid thoracic" }, { v: "SPINAL_SINGLE_HIGH_THORACIC", label: "High thoracic" },
        ]},
        { v: "SPINAL_CONTINUOUS", label: "Continuous", children: [
          { v: "SPINAL_CONT_LUMBAR", label: "Lumbar" }, { v: "SPINAL_CONT_LOW_THORACIC", label: "Low thoracic" },
          { v: "SPINAL_CONT_MID_THORACIC", label: "Mid thoracic" }, { v: "SPINAL_CONT_HIGH_THORACIC", label: "High thoracic" },
        ]},
      ]},
      { v: "EPIDURAL", label: "Epidural", children: [
        { v: "EPIDURAL_CAUDAL", label: "Caudal" }, { v: "EPIDURAL_LUMBAR", label: "Lumbar" },
        { v: "EPIDURAL_LOW_THORACIC", label: "Low thoracic" }, { v: "EPIDURAL_MID_THORACIC", label: "Mid thoracic" }, { v: "EPIDURAL_HIGH_THORACIC", label: "High thoracic" },
      ]},
      { v: "CSE", label: "Combined spinal-epidural (CSE)", children: [
        { v: "CSE_LUMBAR", label: "Lumbar" }, { v: "CSE_LOW_THORACIC", label: "Low thoracic" }, { v: "CSE_MID_THORACIC", label: "Mid thoracic" }, { v: "CSE_HIGH_THORACIC", label: "High thoracic" },
      ]},
      { v: "DPE", label: "Dural Puncture Epidural (DPE)" },
    ]},
    { v: "PERIPHERAL", label: "Peripheral nerve block", children: [
      { v: "BLOCK_UPPER", label: "Upper extremity", children: [
        { v: "BLOCK_INTERSCALENE", label: "Interscalene" }, { v: "BLOCK_SUPRACLAVICULAR", label: "Supraclavicular" },
        { v: "BLOCK_INFRACLAVICULAR", label: "Infraclavicular" }, { v: "BLOCK_AXILLARY", label: "Axillary" },
        { v: "BLOCK_WRIST", label: "Wrist block" }, { v: "BLOCK_DIGITAL", label: "Digital block" },
        { v: "BLOCK_BIER", label: "Bier block (IVRA)" }, { v: "BLOCK_ELBOW", label: "Elbow block" },
      ]},
      { v: "BLOCK_LOWER", label: "Lower extremity", children: [
        { v: "BLOCK_FEMORAL", label: "Femoral nerve" }, { v: "BLOCK_ADDUCTOR", label: "Adductor canal (saphenous)" },
        { v: "BLOCK_SCIATIC", label: "Sciatic nerve" }, { v: "BLOCK_POPLITEAL", label: "Popliteal sciatic" },
        { v: "BLOCK_ANKLE", label: "Ankle block" }, { v: "BLOCK_OBTURATOR", label: "Obturator nerve" },
        { v: "BLOCK_LAT_FEMORAL", label: "Lateral femoral cutaneous" }, { v: "BLOCK_LUMBAR_PLEXUS", label: "Lumbar plexus (psoas)" },
        { v: "BLOCK_IPACK", label: "IPACK" }, { v: "BLOCK_GENICULAR", label: "Genicular nerves" }, { v: "BLOCK_FOOT", label: "Foot block" },
      ]},
      { v: "BLOCK_TRUNK", label: "Trunk / Abdominal wall", children: [
        { v: "BLOCK_TAP", label: "TAP block" }, { v: "BLOCK_RECTUS", label: "Rectus sheath block" },
        { v: "BLOCK_PARAVERTEBRAL", label: "Paravertebral block" }, { v: "BLOCK_ESP", label: "Erector spinae plane (ESP)" },
        { v: "BLOCK_SERRATUS", label: "Serratus anterior plane" }, { v: "BLOCK_PECS1", label: "PECS I" }, { v: "BLOCK_PECS2", label: "PECS II" },
        { v: "BLOCK_QL", label: "Quadratus lumborum (QL)" }, { v: "BLOCK_ILIOINGUINAL", label: "Ilioinguinal / iliohypogastric" }, { v: "BLOCK_INTERCOSTAL", label: "Intercostal block" },
      ]},
      { v: "BLOCK_HEAD_NECK", label: "Head & Neck", children: [
        { v: "BLOCK_SUPERFICIAL_CERVICAL", label: "Superficial cervical plexus" }, { v: "BLOCK_DEEP_CERVICAL", label: "Deep cervical plexus" },
        { v: "BLOCK_SCALP", label: "Scalp block" }, { v: "BLOCK_TRIGEMINAL", label: "Trigeminal nerve" },
        { v: "BLOCK_SPHENOPALATINE", label: "Sphenopalatine ganglion" }, { v: "BLOCK_GLOSSOPHARYNGEAL", label: "Glossopharyngeal nerve" },
      ]},
      { v: "BLOCK_OPHTHALMIC", label: "Ophthalmic", children: [
        { v: "BLOCK_PERIBULBAR", label: "Peribulbar block" }, { v: "BLOCK_RETROBULBAR", label: "Retrobulbar block" },
        { v: "BLOCK_SUB_TENONS", label: "Sub-Tenon's block" }, { v: "BLOCK_TOPICAL_EYE", label: "Topical (eye)" },
      ]},
    ]},
  ]},
  { v: "SEDATION", label: "Sedation / MAC", children: [
    { v: "SEDATION_CONSCIOUS", label: "Conscious sedation" }, { v: "SEDATION_DEEP", label: "Deep sedation" }, { v: "SEDATION_MAC", label: "Monitored anesthesia care (MAC)" },
  ]},
  { v: "LOCAL", label: "Local infiltration" },
  { v: "OTHER", label: "Other…" },
]
