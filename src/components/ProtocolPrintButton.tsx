"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Printer } from "lucide-react"
import dynamic from "next/dynamic"

const AnesthesiaProtocolPDF = dynamic(
  () => import("@/components/AnesthesiaProtocolPDF").then(m => m.AnesthesiaProtocolPDF),
  { ssr: false }
)

export function ProtocolPrintButton({ caseId }: { caseId: string }) {
  const [open, setOpen] = useState(false)
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [patientId, setPatientId] = useState("")
  const [ready, setReady] = useState(false)

  function handleOpen() {
    setReady(false)
    setOpen(true)
  }

  return (
    <>
      <Button onClick={handleOpen} variant="outline" className="gap-2">
        <Printer className="h-4 w-4" />
        Print protocol
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Generate printable anaesthesia protocol</DialogTitle>
          </DialogHeader>

          {!ready ? (
            <div className="space-y-4">
              <p className="text-sm text-slate-500">
                Enter the patient details for the printed protocol. This information is used only to generate the document — it is never uploaded or stored anywhere.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>First name</Label>
                  <Input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Ivanka" />
                </div>
                <div className="space-y-1">
                  <Label>Last name</Label>
                  <Input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Petrova" />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Patient ID / File №</Label>
                <Input value={patientId} onChange={e => setPatientId(e.target.value)} placeholder="123456" />
              </div>
              <Button onClick={() => setReady(true)} className="w-full bg-blue-600 hover:bg-blue-700">
                Generate protocol
              </Button>
            </div>
          ) : (
            <AnesthesiaProtocolPDF
              caseId={caseId}
              patientFirstName={firstName}
              patientLastName={lastName}
              patientId={patientId}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
