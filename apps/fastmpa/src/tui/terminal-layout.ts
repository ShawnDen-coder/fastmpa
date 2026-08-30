export interface TuiLayout {
  readonly showSecondaryMetadata: boolean;
  readonly showRunContext: boolean;
  readonly maxLogLines: number;
}

/** Keep the conversation usable at narrow widths without switching layouts. */
export function tuiLayout(columns: number): TuiLayout {
  if (columns < 80)
    return {
      showSecondaryMetadata: false,
      showRunContext: false,
      maxLogLines: 8,
    };
  if (columns < 120)
    return {
      showSecondaryMetadata: true,
      showRunContext: false,
      maxLogLines: 12,
    };
  return {
    showSecondaryMetadata: true,
    showRunContext: true,
    maxLogLines: 16,
  };
}
