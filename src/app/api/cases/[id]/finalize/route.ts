import { NextRequest, NextResponse, after } from "next/server"
import { getAuthUser } from "@/lib/mobile-auth"
import { prisma } from "@/lib/prisma"
import { logAudit } from "@/lib/audit"
import { writeSnapshotAsync } from "@/lib/case-audit"
import { syncCaseRelational } from "@/lib/relational-sync"
import { canAccessCase } from "@/lib/access-control"
import { corsHeaders } from "@/lib/cors"
import caseEmitter from "@/lib/caseEmitter"

const CORS = corsHeaders()

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser(req)
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = user.id

  const { id } = await params

  const c = await prisma.case.findUnique({
    where: { id },
    select: {
      userId: true,
      status: true,
      user:   { select: { institutionId: true } },
      preop:  { select: { id: true } },
      intraop: {
        select: {
          id: true,
          startTime: true,
          endTime: true,
          techniques: true,
        },
      },
      postop: {
        select: {
          aldreteActivity:      true,
          aldreteRespiration:   true,
          aldreteCirculation:   true,
          aldreteConsciousness: true,
          aldreteSpO2:          true,
          disposition:          true,
        },
      },
    },
  })

  if (!c) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (!canAccessCase(user, c)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  if (c.status === "COMPLETE") return NextResponse.json({ error: "Case is already finalised" }, { status: 409 })

  // Clinical validation gates
  if (!c.preop) {
    return NextResponse.json({ error: "Cannot finalise: preoperative assessment is missing", reason: "missing_preop" }, { status: 422 })
  }
  if (!c.intraop || !c.intraop.startTime) {
    return NextResponse.json({ error: "Cannot finalise: intraoperative record has not been started", reason: "missing_intraop" }, { status: 422 })
  }
  const techniques = Array.isArray(c.intraop.techniques) ? c.intraop.techniques : []
  if (techniques.length === 0) {
    return NextResponse.json({ error: "Cannot finalise: at least one anaesthesia technique must be recorded", reason: "missing_technique" }, { status: 422 })
  }
  if (c.intraop.endTime && c.intraop.startTime >= c.intraop.endTime) {
    return NextResponse.json({ error: "Cannot finalise: intraop end time must be after start time", reason: "invalid_intraop_times" }, { status: 422 })
  }
  if (!c.postop) {
    return NextResponse.json({ error: "Cannot finalise: postoperative record is missing", reason: "missing_postop" }, { status: 422 })
  }
  const hasAldrete =
    c.postop.aldreteActivity      != null ||
    c.postop.aldreteRespiration   != null ||
    c.postop.aldreteCirculation   != null ||
    c.postop.aldreteConsciousness != null ||
    c.postop.aldreteSpO2          != null
  if (!hasAldrete) {
    return NextResponse.json({ error: "Cannot finalise: at least one Aldrete subscore must be recorded", reason: "missing_aldrete" }, { status: 422 })
  }
  if (!c.postop.disposition) {
    return NextResponse.json({ error: "Cannot finalise: patient disposition (Ward/PACU/ICU) must be recorded", reason: "missing_disposition" }, { status: 422 })
  }

  // Reconcile the relational mirror before locking the case, so the snapshot
  // and any subsequent OMOP export agree with the queryable rows.
  try {
    await syncCaseRelational(prisma, id)
  } catch (err) {
    console.error("[finalize] relational sync failed", id, err)
    return NextResponse.json({ error: "Failed to reconcile relational clinical rows. Case status unchanged." }, { status: 500 })
  }

  // Write the immutable snapshot first (upsert = idempotent). If this throws,
  // the case status is not changed — caller can retry.
  try {
    await writeSnapshotAsync(prisma, id)
  } catch (err) {
    console.error("[finalize] snapshot failed", id, err)
    return NextResponse.json({ error: "Failed to write finalization snapshot. Case status unchanged." }, { status: 500 })
  }

  // Commit the status change only after the snapshot is safely written.
  const finalizedAt = new Date()
  await prisma.case.update({
    where: { id },
    data: { status: "COMPLETE", finalizedAt },
  })

  after(() => logAudit(userId, "CASE_FINALIZED", id, { from: c.status, to: "COMPLETE" }))
  caseEmitter.emit(id, { type: "case_updated", sections: { status: true, preop: false, intraop: false, postop: false, notes: false } })

  return NextResponse.json({ id, status: "COMPLETE", finalizedAt })
}
