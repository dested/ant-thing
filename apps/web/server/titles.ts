// A puzzle's title is the only free text a visitor can publish, so it is kept short and plain.

const BLOCKED = [
  'fuck', 'shit', 'cunt', 'nigg', 'fagg', 'retard', 'rape', 'nazi', 'hitler', 'porn', 'penis', 'vagina',
  'dick', 'cock', 'pussy', 'whore', 'slut', 'bitch', 'kike', 'spic', 'chink', 'tranny', 'kys',
]

export const TITLE_MAX = 48

/** The title as it will be stored, or the reason it can't be. */
export function cleanTitle(raw: string): { title: string } | { problem: string } {
  const title = raw
    .normalize('NFKC')
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (title.length < 3) return { problem: 'Give the puzzle a name of at least three characters.' }
  if (title.length > TITLE_MAX) return { problem: `Keep the name under ${TITLE_MAX} characters.` }
  if (/https?:|www\.|\.[a-z]{2,6}(\/|$|\s)|@/i.test(title)) return { problem: 'Names can’t contain links or handles.' }
  const flat = title.toLowerCase().replace(/[^a-z]/g, '')
  if (BLOCKED.some(word => flat.includes(word))) return { problem: 'Pick a different name.' }
  return { title }
}
