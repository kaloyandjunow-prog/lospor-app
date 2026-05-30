import { NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/lib/mobile-auth"
import { prisma } from "@/lib/prisma"
import caseEmitter from "@/lib/caseEmitter"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser(req)
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  const existing = await prisma.case.findUnique({
    where: { id },
    select: {
      userId: true,
      user:   { select: { institutionId: true } },
    },
  })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const isAdmin = user.role === "ADMIN"
  // Explicit null guards: a HOD with no institution must never match all cases
  const isHOD   = user.role === "HEAD_OF_DEPT" &&
    !!user.institutionId &&
    user.institutionId === existing.user?.institutionId
  if (existing.userId !== user.id && !isAdmin && !isHOD) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`data: {"type":"connected"}\n\n`))

      function listener(data: unknown) {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
          // If the case was deleted, close the stream after sending the event
          if (data && typeof data === "object" && (data as any).type === "case_deleted") {
            try { controller.close() } catch {}
          }
        } catch {}
      }

      // Listen on the case-scoped channel (emits both case_updated and case_deleted events)
      caseEmitter.on(id, listener)

      req.signal.addEventListener("abort", () => {
        caseEmitter.off(id, listener)
        try { controller.close() } catch {}
      })
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type":      "text/event-stream",
      "Cache-Control":     "no-cache, no-transform",
      "Connection":        "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}
