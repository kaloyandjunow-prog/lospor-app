// Server-side best-effort PII detector for free-text fields.
// Returns a human-readable error string if a likely identifier is found, or null if clean.
// Detection is intentional best-effort: it catches common patterns, not all possible PHI.
// False positives are logged via auditLog so we can tune over time.

const EMAIL_RE  = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/
const DIGIT7_RE = /\b\d{7,}\b/
const DATE_RE   = /\b\d{1,2}[.\/-]\d{1,2}[.\/-]\d{4}\b/

// Two consecutive capitalised words of 2+ chars each — likely a person's name.
// Supports:
//   - Latin letters (via \p{Lu}/\p{Ll} Unicode properties)
//   - Cyrillic letters (Unicode block Ѐ-ӿ, covers Bulgarian and other Slavic scripts)
//   - Hyphenated names: "Marie-Louise", "Jean-Paul"
// Each name segment must be 2+ letters.  The first letter of each word must be
// uppercase (Latin or Cyrillic).  Words are separated by whitespace.
//
// Pattern breakdown:
//   (?<![^\s])              — word must start at beginning of string or after whitespace
//   [\p{Lu}Ѐ-ӿ]            — uppercase letter (Latin or Cyrillic)
//   [\p{Lu}\p{Ll}Ѐ-ӿ]+     — one or more letters (any case, Latin or Cyrillic) — 2+ total
//   (?:-[\p{Lu}\p{Ll}Ѐ-ӿ]{2,})* — optional hyphenated segments (e.g. "-Louise")
//   \s+                     — whitespace separator
//   (same pattern for second word)
//   (?=\s|$)                — must be followed by whitespace or end of string
const NAME_RE = /(?<![^\s])[\p{Lu}Ѐ-ӿ][\p{Lu}\p{Ll}Ѐ-ӿ]+(?:-[\p{Lu}\p{Ll}Ѐ-ӿ]{2,})*\s+[\p{Lu}Ѐ-ӿ][\p{Lu}\p{Ll}Ѐ-ӿ]+(?:-[\p{Lu}\p{Ll}Ѐ-ӿ]{2,})*(?=\s|$)/u

// EGN: Bulgarian personal identifier — 10 digits with date + checksum structure.
const EGN_RE    = /\b(\d{10})\b/g

function isValidEGN(s: string): boolean {
  if (s.length !== 10) return false

  // Date portion: YYMMDD
  // Month offset encoding:
  //   plain month (1–12):  born 1900–1999
  //   month + 20 (21–32):  historical foreign residents (1800s)
  //   month + 40 (41–52):  born 2000+
  let yy = parseInt(s.slice(0, 2), 10)
  let mm = parseInt(s.slice(2, 4), 10)
  const dd = parseInt(s.slice(4, 6), 10)

  let century: number
  if (mm >= 40) {
    // 2000s cohort
    mm -= 40
    century = 2000
  } else if (mm >= 20) {
    // Historical foreign residents (1800s)
    mm -= 20
    century = 1800
  } else {
    // Standard 1900s; but if yy is 00–30 with no offset some registrars
    // may use 2000+ — however the canonical encoding for 2000+ is mm+40,
    // so we keep 1900 here for the unambiguous case.
    century = 1900
  }

  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return false
  if (yy < 0 || yy > 99) return false

  // Validate that the date is a real calendar date (not e.g. Feb 30).
  const fullYear = century + yy
  const dateObj = new Date(fullYear, mm - 1, dd)  // month is 0-indexed
  if (
    dateObj.getFullYear() !== fullYear ||
    dateObj.getMonth() !== mm - 1 ||
    dateObj.getDate() !== dd
  ) {
    return false
  }

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
