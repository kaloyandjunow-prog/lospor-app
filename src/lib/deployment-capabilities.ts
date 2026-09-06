"use client"

import { useEffect, useState } from "react"
import {
  parseClinicalAiCapabilities,
  parsePediatricModeCapability,
  safeClinicalAiCapabilities,
  safePediatricModeCapability,
  type CapabilityReason,
  type ClinicalAiCapabilities,
  type PediatricModeCapability,
} from "@lospor/core/deployment-capabilities"
import { LOSPOR_WEB_CLIENT_VERSION } from "@/lib/client-version"

/**
 * Reading the deployment's declaration is shared logic and lives in core.
 * What is left here is this app's half of it: the same-origin request, the
 * caches the components read, and a refresh when the tab comes back.
 */

export type {
  AuthenticationCapabilities,
  CapabilityReason,
  ClinicalAiCapabilities,
  DeploymentCapabilities,
  PediatricModeCapability,
  PediatricModeCapabilityReason,
  RuntimeCapability,
} from "@lospor/core/deployment-capabilities"

export type ClinicalAiUnavailableMessageKey =
  | "deploymentCapabilities.externalAiDisabled"
  | "deploymentCapabilities.externalAiUnavailable"

export type PediatricCapabilityMessageKey =
  | "newSelectionDisabled"
  | "newSelectionUnavailable"
  | "newSelectionClientUpdate"
  | "existingRecordReadOnlyDisabled"
  | "existingRecordReadOnlyUnavailable"
  | "existingRecordReadOnlyClientUpdate"

export function capabilityMessageKey(
  reason: CapabilityReason,
): ClinicalAiUnavailableMessageKey {
  return reason === "DISABLED_BY_DEPLOYMENT"
    ? "deploymentCapabilities.externalAiDisabled"
    : "deploymentCapabilities.externalAiUnavailable"
}

/**
 * An unreviewed ruleset and one this client cannot parse both read as
 * unavailable here: neither is something the clinician can act on at the
 * bedside, and both send them to the same person.
 */
export function pediatricCapabilityMessageKey(
  capability: PediatricModeCapability,
  existingRecord: boolean,
): PediatricCapabilityMessageKey {
  if (existingRecord) {
    if (capability.reason === "DISABLED_BY_DEPLOYMENT") {
      return "existingRecordReadOnlyDisabled"
    }
    if (capability.reason === "CLIENT_UPDATE_REQUIRED") {
      return "existingRecordReadOnlyClientUpdate"
    }
    return "existingRecordReadOnlyUnavailable"
  }
  if (capability.reason === "DISABLED_BY_DEPLOYMENT") {
    return "newSelectionDisabled"
  }
  if (capability.reason === "CLIENT_UPDATE_REQUIRED") {
    return "newSelectionClientUpdate"
  }
  return "newSelectionUnavailable"
}

function requestCapabilities(): Promise<Response> {
  return fetch("/api/capabilities", {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers: { Accept: "application/json" },
  })
}

let cached: ClinicalAiCapabilities | null = null
let loading: Promise<ClinicalAiCapabilities> | null = null

export function loadClinicalAiCapabilities(): Promise<ClinicalAiCapabilities> {
  if (cached) return Promise.resolve(cached)
  if (loading) return loading
  loading = requestCapabilities()
    .then(async response => {
      if (!response.ok) return safeClinicalAiCapabilities()
      return parseClinicalAiCapabilities(await response.json().catch(() => null))
    })
    .catch(() => safeClinicalAiCapabilities())
    .then(result => {
      cached = result
      return result
    })
    .finally(() => { loading = null })
  return loading
}

export function clearClinicalAiCapabilitiesCache(): void {
  cached = null
  loading = null
}

export function useClinicalAiCapabilities(): ClinicalAiCapabilities {
  const [capabilities, setCapabilities] = useState(
    () => cached ?? safeClinicalAiCapabilities(),
  )
  useEffect(() => {
    let active = true
    void loadClinicalAiCapabilities().then(value => {
      if (active) setCapabilities(value)
    })
    return () => { active = false }
  }, [])
  return capabilities
}

let cachedPediatricMode: PediatricModeCapability | null = null
let cachedPediatricModeAt = 0
let loadingPediatricMode: Promise<PediatricModeCapability> | null = null
const PEDIATRIC_CAPABILITY_REFRESH_MS = 15_000

export function loadPediatricModeCapability(
  force = false,
): Promise<PediatricModeCapability> {
  if (
    !force
    && cachedPediatricMode
    && Date.now() - cachedPediatricModeAt < PEDIATRIC_CAPABILITY_REFRESH_MS
  ) return Promise.resolve(cachedPediatricMode)
  if (loadingPediatricMode) return loadingPediatricMode
  loadingPediatricMode = requestCapabilities()
    .then(async response => response.ok
      ? parsePediatricModeCapability(
          await response.json().catch(() => null),
          LOSPOR_WEB_CLIENT_VERSION,
        )
      : safePediatricModeCapability())
    .catch(() => safePediatricModeCapability())
    .then(result => {
      cachedPediatricMode = result
      cachedPediatricModeAt = Date.now()
      return result
    })
    .finally(() => { loadingPediatricMode = null })
  return loadingPediatricMode
}

export function clearPediatricModeCapabilityCache(): void {
  cachedPediatricMode = null
  cachedPediatricModeAt = 0
  loadingPediatricMode = null
}

export function usePediatricModeCapability(): PediatricModeCapability {
  const [capability, setCapability] = useState(
    () => cachedPediatricMode ?? safePediatricModeCapability(),
  )
  useEffect(() => {
    let active = true
    const refresh = (force = false) => void loadPediatricModeCapability(force).then(value => {
      if (active) setCapability(value)
    })
    refresh()
    const interval = window.setInterval(
      () => refresh(true),
      PEDIATRIC_CAPABILITY_REFRESH_MS,
    )
    const onFocus = () => refresh(true)
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh(true)
    }
    window.addEventListener("focus", onFocus)
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      active = false
      window.clearInterval(interval)
      window.removeEventListener("focus", onFocus)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [])
  return capability
}
