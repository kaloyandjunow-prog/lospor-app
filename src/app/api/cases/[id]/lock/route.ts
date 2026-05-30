import { NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/lib/mobile-auth"
import { prisma } from "@/lib/prisma"

// ---------------------------------------------------------------------------
// Helper — resolve case ownership (same pattern as [id]/route.ts)
// Returns the case status string if found and allowed, or a NextResponse error.
// ---------------------------------------------------------------------------
async function resolveCase(
  req: NextRequest,
  id: string,
): Promise<{ userId: string; status: string } | NextResponse> {
  const user = await getAuthUser(req)
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const existing = await prisma.case.findUnique({
    where: { id },
    select: {
      userId: true,
      status: true,
      user: { select: { institutionId: true } },
    },
  })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const isAdmin = user.role === "ADMIN"
  const isHOD =
    user.role === "HEAD_OF_DEPT" &&
    existing.user?.institutionId === user.institutionId
  if (existing.userId !== user.id && !isAdmin && !isHOD)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  return { userId: user.id, status: existing.status }
}

const LOCK_TTL_MS = 30_000

// ---------------------------------------------------------------------------
// POST /api/cases/[id]/lock — acquire lock
// Body: { deviceId: string }
// ---------------------------------------------------------------------------
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const resolved = await resolveCase(req, id)
  if (resolved instanceof NextResponse) return resolved
  const { userId, status } = resolved

  // COMPLETE cases need no locking
  if (status === "COMPLETE") {
    return NextResponse.json({ acquired: true, yours: true })
  }

  const body: { deviceId?: string } = await req.json().catch(() => ({}))
  const deviceId = typeof body.deviceId === "string" ? body.deviceId : ""

  const now = new Date()
  const expiresAt = new Date(now.getTime() + LOCK_TTL_MS)

  const existing = await prisma.caseLock.findUnique({ where: { caseId: id } })

  if (existing && existing.expiresAt > now) {
    // Active lock held by someone
    if (existing.userId === userId && existing.deviceId === deviceId) {
      // Same device reclaiming — refresh the TTL
      await prisma.caseLock.update({
        where: { caseId: id },
        data: { expiresAt },
      })
      return NextResponse.json({ acquired: true, yours: true })
    }
    // Different device/user holds the lock — look up holder name for the watching banner
    let holderName: string | null = null
    try {
      const holder = await prisma.user.findUnique({
        where: { id: existing.userId },
        select: { name: true, email: true },
      })
      holderName = holder?.name ?? holder?.email ?? null
    } catch {}
    return NextResponse.json({ acquired: false, holderName }, { status: 409 })
  }

  // No lock or expired lock — upsert
  await prisma.caseLock.upsert({
    where: { caseId: id },
    create: { caseId: id, userId, deviceId, expiresAt },
    update: { userId, deviceId, expiresAt },
  })
  return NextResponse.json({ acquired: true })
}

// ---------------------------------------------------------------------------
// PATCH /api/cases/[id]/lock — heartbeat (extend TTL)
// Body: { deviceId: string }
// ---------------------------------------------------------------------------
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const resolved = await resolveCase(req, id)
  if (resolved instanceof NextResponse) return resolved
  const { userId } = resolved

  const body: { deviceId?: string } = await req.json().catch(() => ({}))
  const deviceId = typeof body.deviceId === "string" ? body.deviceId : ""

  const now = new Date()
  const expiresAt = new Date(now.getTime() + LOCK_TTL_MS)

  const existing = await prisma.caseLock.findUnique({ where: { caseId: id } })

  if (existing && existing.userId === userId && existing.deviceId === deviceId) {
    await prisma.caseLock.update({
      where: { caseId: id },
      data: { expiresAt },
    })
    return NextResponse.json({ extended: true })
  }

  return NextResponse.json({ extended: false }, { status: 409 })
}

// ---------------------------------------------------------------------------
// DELETE /api/cases/[id]/lock — release lock (idempotent)
// Body: { deviceId: string }
// ---------------------------------------------------------------------------
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const resolved = await resolveCase(req, id)
  if (resolved instanceof NextResponse) return resolved
  const { userId } = resolved

  const body: { deviceId?: string } = await req.json().catch(() => ({}))
  const deviceId = typeof body.deviceId === "string" ? body.deviceId : ""

  const existing = await prisma.caseLock.findUnique({ where: { caseId: id } })

  if (existing && existing.userId === userId && existing.deviceId === deviceId) {
    await prisma.caseLock.delete({ where: { caseId: id } })
  }

  // Always 200 — idempotent
  return NextResponse.json({ released: true })
}
