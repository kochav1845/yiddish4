export function stripDiacritics(text: string): string {
  return text.replace(/[\u0591-\u05C7]/g, "");
}
