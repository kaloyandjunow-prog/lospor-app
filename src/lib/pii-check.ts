// Server-side best-effort PII detector for free-text fields.
// Returns a human-readable error string if a likely identifier is found, or null if clean.
// Detection is intentional best-effort: it catches common patterns, not all possible PHI.
// False positives are logged via auditLog so we can tune over time.

const EMAIL_RE  = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/
const DIGIT7_RE = /\b\d{7,}\b/
const DATE_RE   = /\b\d{1,2}[.\/-]\d{1,2}[.\/-]\d{4}\b/
// Two consecutive capitalised words longer than 3 chars each (likely a name).
// Supports Latin and Cyrillic. Suppresses e.g. "Type 2 Diabetes" (only 4 chars each, passes).
const NAME_RE   = /(?<![^\s])[\p{Lu}][\p{Ll}]{3,}\s+[\p{Lu}][\p{Ll}]{3,}(?=\s|$)/u

// EGN: Bulgarian personal identifier — 10 digits with date + checksum structure.
const EGN_RE    = /\b(\d{10})\b/g

function isValidEGN(s: string): boolean {
  if (s.length !== 10) return false
  // Date portion: YYMMDD (month offset: +20 for 1800s, +40 for 2000s, plain for 1900s)
  let yy = parseInt(s.slice(0, 2), 10)
  let mm = parseInt(s.slice(2, 4), 10)
  const dd = parseInt(s.slice(4, 6), 10)
  if (mm > 40) mm -= 40
  else if (mm > 20) mm -= 20
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return false
  if (yy < 0 || yy > 99) return false
  // Checksum: weighted mod 11
  const weights = [2, 4, 8, 5, 10, 9, 7, 3, 6]
  let sum = 0
  for (let i = 0; i < 9; i++) sum += parseInt(s[i], 10) * weights[i]
  const check = sum % 11 === 10 ? 0 : sum % 11
  return parseInt(s[9], 10) === check
}

export function checkPII(fields: Record<string, string | null | undefined>): string | null {
  for (const [field, value] of Object.entries(fields)) {
    if (!value || typeof value !== "string") continue

    // EGN check (structural — low false positive rate)
    const egnMatches = [...value.matchAll(EGN_RE)]
    if (egnMatches.some(m => isValidEGN(m[1]))) {
      return `"${field}" appears to contain an EGN (Bulgarian personal ID number).`
    }

    // Long digit sequences (medical record numbers, file numbers)
    if (DIGIT7_RE.test(value)) {
      return `"${field}" appears to contain a long ID or reference number (7+ digits).`
    }

    // Date patterns
    if (DATE_RE.test(value)) {
      return `"${field}" appears to contain a date in a common format (e.g. DD.MM.YYYY).`
    }

    // Email addresses
    if (EMAIL_RE.test(value)) {
      return `"${field}" appears to contain an email address.`
    }

    // Two consecutive capitalised words — likely a person's name
    if (NAME_RE.test(value)) {
      return `"${field}" appears to contain a name (two capitalised words).`
    }
  }
  return null
}
