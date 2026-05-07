// Text helpers count real typed characters for form limits.
// Spaces and line breaks do not count because that is the project rule.
export function countMeaningfulCharacters(value) {
  return String(value || "").replace(/\s+/g, "").length;
}

export function hasMeaningfulText(value) {
  return countMeaningfulCharacters(value) > 0;
}
