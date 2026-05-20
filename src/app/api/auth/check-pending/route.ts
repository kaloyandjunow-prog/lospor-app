import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email") ?? ""
  if (!email) return NextResponse.json({ pending: false })

  const user = await prisma.user.findUnique({
    where: { email },
    select: { approvedAt: true },
  })

  return NextResponse.json({ pending: user != null && user.approvedAt === null })
}
