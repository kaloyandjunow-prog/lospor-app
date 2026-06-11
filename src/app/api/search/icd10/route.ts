import { NextRequest, NextResponse } from "next/server"

// Legacy redirect — this endpoint was renamed to /api/search/icd11.
// Kept as a permanent redirect so old mobile builds and bookmarks keep working.
export async function GET(req: NextRequest) {
  const url = req.nextUrl.clone()
  url.pathname = url.pathname.replace("/api/search/icd10", "/api/search/icd11")
  return NextResponse.redirect(url, { status: 308 })
}
