// Tile fills. Status colours come from the backend (node.display.colors, resolved
// from the OKLCH scheme). The explode/collapse control-tile colours are not node
// statuses; hard-coded here for now (also available via GET /api/theme later).

export const CONTROL_COLORS = {
  pin: "oklch(0.49 0.06 245)", // slate blue
  collapse: "oklch(0.47 0.06 305)", // muted violet
} as const;

/**
 * Vertical gradient approximating the prototype's L+0.04 (top) to L-0.03
 * (bottom). color-mix works for any CSS colour string (hex or oklch), so we do
 * not need to parse the backend's colour.
 */
export function tileFill(color: string): string {
  const top = `color-mix(in oklch, ${color} 90%, white)`;
  const bottom = `color-mix(in oklch, ${color} 94%, black)`;
  return `linear-gradient(180deg, ${top}, ${bottom})`;
}
