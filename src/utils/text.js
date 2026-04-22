export function countMeaningfulCharacters(value) {
  return String(value || "").replace(/\s+/g, "").length;
}

export function hasMeaningfulText(value) {
  return countMeaningfulCharacters(value) > 0;
}
