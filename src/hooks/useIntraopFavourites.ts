"use client"
import { useEffect, useState } from "react"

type Preferences = {
  intraopFavouriteDrugs?: string[]
  intraopFavouriteInfusions?: string[]
}

/**
 * Favourite bolus drugs and infusions, as chosen in settings.
 *
 * Stored server-side on the user (`/api/user` → `preferences`), which is what
 * lets the phone and the browser show the same shortlist. Mirrors mobile's
 * `use-intraop-favourites.ts` — same source, same shape, deliberately.
 */
export function useIntraopFavourites() {
  const [favouriteDrugs, setFavouriteDrugs] = useState<string[]>([])
  const [favouriteInfusions, setFavouriteInfusions] = useState<string[]>([])

  useEffect(() => {
    let cancelled = false
    fetch("/api/user", { cache: "no-store" })
      .then(res => (res.ok ? res.json() : null))
      .then((data: { preferences?: Preferences } | null) => {
        if (cancelled || !data) return
        setFavouriteDrugs(data.preferences?.intraopFavouriteDrugs ?? [])
        setFavouriteInfusions(data.preferences?.intraopFavouriteInfusions ?? [])
      })
      .catch(() => {
        // Favourites are a convenience — the full library is still reachable.
      })
    return () => { cancelled = true }
  }, [])

  return { favouriteDrugs, favouriteInfusions }
}
