import { NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/lib/mobile-auth"
import { requireRole } from "@/lib/access-control"
import { DATA_DICTIONARY, DICTIONARY_VERSION } from "@/lib/data-dictionary"
import { corsHeaders } from "@/lib/cors"

const CORS = corsHeaders("GET, OPTIONS")

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!requireRole(user, ["ADMIN"])) return NextResponse.json({ error: "Admin access required" }, { status: 403 })

  return NextResponse.json(
    { version: DICTIONARY_VERSION, entry_count: DATA_DICTIONARY.length, entries: DATA_DICTIONARY },
    {
      headers: {
        ...CORS,
        "Content-Disposition": `attachment; filename="lospor_data_dictionary_${DICTIONARY_VERSION}.json"`,
      },
    },
  )
}
