/** Splits text into sentences on ., ! or ? followed by space. Sources use it to list the sentences reactions are reported against. */
export const sentencesOf = (text: string): string[] => String(text).split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
