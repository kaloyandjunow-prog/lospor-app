/** The part of a running item that lies after "now": the item's own colour in slanted stripes, aligned from cell to cell. */
export function runOnStripes(color: string, column: number, columnWidth: number): React.CSSProperties {
  const stripe = `linear-gradient(135deg, ${color} 25%, transparent 25%, transparent 50%, ${color} 50%, ${color} 75%, transparent 75%)`
  return { backgroundImage: stripe, backgroundSize: "14px 14px", backgroundPositionX: `${-column * columnWidth}px` }
}
