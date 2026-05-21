"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Printer } from "lucide-react"
import dynamic from "next/dynamic"

const AnesthesiaProtocolPDF = dynamic(
  () => import("@/components/AnesthesiaProtocolPDF").then(m => m.AnesthesiaProtocolPDF),
  { ssr: false }
)

export function ProtocolPrintButton({ caseId }: { caseId: string }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button onClick={() => setOpen(true)} variant="outline" className="gap-2">
        <Printer className="h-4 w-4" />
        Print protocol
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Printable anaesthesia protocol</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded px-3 py-2">
            Patient identity fields are left blank — fill them in by hand after printing. Do not enter patient names or ID numbers into LOSPOR.
          </p>
          {open && <AnesthesiaProtocolPDF caseId={caseId} />}
        </DialogContent>
      </Dialog>
    </>
  )
}
