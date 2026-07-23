import { getLiveSession } from "@/lib/live-session"
import { jwtVerify } from "jose"
import { isRevokedAsync } from "@/lib/token-blocklist"
import { prisma } from "@/lib/prisma"
import { notFound, redirect } from "next/navigation"
import type { Viewport } from "next"
import { PrintPageClient } from "@/components/case-summary/PrintPageClient"
import type { CaseDetail } from "@/types/case-detail"

function secret() {
  return new TextEncoder().encode(process.env.NEXTAUTH_SECRET!)
}

// Verify a short-lived print token issued by POST /api/cases/:id/print-token.
// Lets the mobile app open this page in the phone browser without a session.
async function verifyPrintToken(token: string, caseId: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secret())
    if (payload.type !== "print") return null
    if (payload.caseId !== caseId) return null
    // Same revocation check the PDF route applies — a spent or revoked token
    // must not still open the record here.
    const jti = payload.jti as string | undefined
    if (jti && await isRevokedAsync(jti)) return null
    return (payload.userId as string) ?? null
  } catch {
    return null
  }
}

// /cases/[id]/print — the dedicated print page for finished cases: the
// two-page anaesthesia record ready for the browser's print dialog. Reached
// from the "Print case" prompt/button (web) or long-press → Print case
// (mobile, via a print token).
// Chrome's Android auto-dark would invert the white sheet — opt the whole
// page out so the record always renders as light paper.
export const viewport: Viewport = { colorScheme: "only light" }

export default async function PrintCasePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ print_token?: string; pdf?: string }>
}) {
  const { id } = await params
  const sp     = await searchParams

  const printToken  = sp?.print_token
  const printUserId = printToken ? await verifyPrintToken(printToken, id) : null
  const isTokenMode = !!printUserId
  // pdf=1 → we are being rendered inside headless Chrome for the PDF route:
  // never fire window.print() there.
  const pdfMode     = sp?.pdf === "1"

  // A valid print token is itself the authorization: signed, 5-minute,
  // case-scoped, and only issued after a role-aware ownership check — so in
  // token mode load the case by id alone (an admin/HOD printing someone
  // else's case would otherwise 404, since the token carries the REQUESTER's
  // id). Session mode keeps the normal role scoping.
  let where: object
  if (isTokenMode) {
    where = { id }
  } else {
    const session = await getLiveSession()
    if (!session?.user?.id) redirect(`/login?callbackUrl=/cases/${id}/print`)
    const me = session.user
    where = me.role === "ADMIN"
      ? { id }
      : me.role === "HEAD_OF_DEPT" && me.institutionId
        ? { id, user: { institutionId: me.institutionId } }
        : { id, userId: me.id }
  }

  const record = await prisma.case.findFirst({
    where,
    include: { preop: true, intraop: true, postop: true, institution: { select: { name: true, city: true } } },
  })
  if (!record) notFound()

  // Serialize Dates → strings (same shape the /api/cases/[id] GET returns);
  // passing the case in avoids a client fetch the token flow couldn't make.
  const initialData = JSON.parse(JSON.stringify(record)) as CaseDetail

  return (
    <PrintPageClient
      caseId={id}
      initialData={initialData}
      autoPrint={isTokenMode && !pdfMode}
      printToken={isTokenMode ? printToken : undefined}
    />
  )
}
