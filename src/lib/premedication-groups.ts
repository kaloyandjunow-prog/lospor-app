/**
 * Premedication drugs, grouped for display.
 *
 * Two sources with different shapes reach this: a paediatric list that
 * already carries its own categories, and the general option library, which
 * carries a `group` per option and has to be inverted into categories here.
 *
 * An option with no group becomes "Other" rather than being dropped. A
 * premedication that exists in the library and appears in no category is a
 * drug the clinician cannot select, which is a worse outcome than a catch-all
 * heading.
 */
export type PremedicationCategory = { cat: string; drugs: string[] }

export function premedicationCategories(
  options: { group?: string | null; label: string }[],
  pediatric?: { category: string; drugs: { name: string }[] }[] | null,
): PremedicationCategory[] {
  if (pediatric) {
    return pediatric.map(category => ({
      cat: category.category,
      drugs: category.drugs.map(drug => drug.name),
    }))
  }

  const byGroup = new Map<string, string[]>()
  for (const option of options) {
    const group = option.group ?? "Other"
    const bucket = byGroup.get(group)
    if (bucket) bucket.push(option.label)
    else byGroup.set(group, [option.label])
  }
  return Array.from(byGroup, ([cat, drugs]) => ({ cat, drugs }))
}
