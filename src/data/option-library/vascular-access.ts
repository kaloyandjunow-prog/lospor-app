// VASCULAR_ACCESS — arterial/venous access tree (VascularAccessTree.tsx TREE).
import type { TreeNode } from "./types"

export const VASCULAR_ACCESS_TREE: TreeNode[] = [
  { v: "ARTERIAL", label: "Arterial", children: [
    { v: "ART_RADIAL", label: "Radial" }, { v: "ART_ULNAR", label: "Ulnar" }, { v: "ART_BRACHIAL", label: "Brachial" },
    { v: "ART_AXILLARY", label: "Axillary" }, { v: "ART_CAROTID", label: "Carotid" }, { v: "ART_FEMORAL", label: "Femoral" },
  ]},
  { v: "VENOUS", label: "Venous", children: [
    { v: "VEN_PERIPHERAL", label: "Peripheral IV" },
    { v: "VEN_CENTRAL", label: "Central", children: [
      { v: "PICC", label: "PICC", children: [
        { v: "PICC_BRACHIAL", label: "Brachial" }, { v: "PICC_BASILIC", label: "Basilic" }, { v: "PICC_CEPHALIC", label: "Cephalic" },
      ]},
      { v: "CVK", label: "Central line", children: [
        { v: "CVK_AXILLARY", label: "Axillary" }, { v: "CVK_IJV", label: "Internal jugular" }, { v: "CVK_EJV", label: "External jugular" },
        { v: "CVK_SUBCLAVIAN", label: "Subclavian" }, { v: "CVK_FEMORAL", label: "Femoral" },
      ]},
    ]},
  ]},
]
