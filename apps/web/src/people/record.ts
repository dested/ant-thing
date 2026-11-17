import data from '~/science/data.json'

/** The middle value of a sorted list, or null when it is empty. */
export function median(sorted: readonly number[]): number | null {
  const mid = sorted[sorted.length >> 1]
  return mid === undefined ? null : mid
}

const usual = data.conformity.find((point) => point.value === 1)

/** How the colony does on the room's puzzle with the page's own rules (bench/science.ts). */
export const ANTS = {
  runs: usual?.runs ?? 0,
  delivered: usual?.delivered ?? 0,
  times: usual?.times ?? [],
  typical: median(usual?.times ?? []),
  cap: data.cap,
}

export const GROUP_LABEL = {
  one: 'One person',
  small: '2 to 8 people',
  large: '9 to 24 people',
} as const
