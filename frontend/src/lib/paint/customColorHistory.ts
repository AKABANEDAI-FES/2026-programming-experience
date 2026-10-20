export const MAX_CUSTOM_COLORS = 5;

export function rememberCustomColor(
  colors: readonly string[],
  nextColor: string,
  presetColors: ReadonlySet<string>,
): string[] {
  if (presetColors.has(nextColor)) {
    return [...colors];
  }

  return [nextColor, ...colors.filter((color) => color !== nextColor)].slice(0, MAX_CUSTOM_COLORS);
}
