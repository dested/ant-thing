/** Every number the ants' behaviour depends on. The page's rule knobs edit a few of these live. */
export interface Params {
  /** Free walking speed, units/s (an ant is 12 units long). */
  antSpeed: number
  /** The speed a carrying ant's pull drops to zero at: the load can't outrun its carriers. */
  carrySpeed: number
  /** How strongly a carrier turns her pull toward the way her grip point is moving, 1/s. */
  conformity: number
  /** Rotational noise on every carrier's pull direction, rad²/s. */
  noise: number
  /** Grip-point speed at which conformity reaches full strength, units/s. */
  vRef: number
  /** Mean seconds a newcomer keeps pulling toward home before she forgets. 0 turns knowledge off. */
  informedTime: number
  /** Standard deviation of each newcomer's personal error about where home is, radians. */
  informedError: number
  /** Whether home is read from the scent field (true) or only from the ant's own path integration. */
  scent: boolean
  /** How much of the straight-line home vector is mixed into a scent reading. */
  compass: number
  /** Seconds of free walking before an ant has her bearings again (a trip to the nest restores them at once). */
  freshTime: number
  /** How much faster a newcomer's knowledge drains while her pull gets nowhere. */
  stallForget: number
  /** Mean seconds a carrier holds on. */
  holdTime: number
  /** Let-go rate multiplier while her grip point is not moving. */
  stallLetGo: number
  /** Chance that an ant who lets go walks home (and lays scent) instead of milling around. */
  homeProb: number
  /** Chance per second that a free ant standing on a free grip point bites. */
  grabRate: number
  /** Chance per second that an ant at the load turns back to recruit. */
  recruitRate: number
  /** Ground friction: the number of aligned pullers per load cell that gives half the top speed. */
  friction: number
  /** Fraction of ground friction each lifting ant removes (diminishing). */
  lift: number
  /** Coulomb friction between load and wall. */
  wallFriction: number
  /** A carrier pulls only if her direction leans this far (cosine) outward from the edge; otherwise she lifts. */
  pullCone: number
  /** Scent staleness: seconds added per second to home marks / load marks. */
  homeAging: number
  foodAging: number
  /** Pull of the ant you control, in ants. */
  playerStrength: number
}

export const DEFAULT_PARAMS: Params = {
  antSpeed: 85,
  carrySpeed: 24,
  conformity: 1,
  noise: 0.3,
  vRef: 4,
  informedTime: 10,
  informedError: 0.35,
  scent: true,
  compass: 0.3,
  freshTime: 20,
  stallForget: 4,
  holdTime: 120,
  stallLetGo: 2,
  homeProb: 0.1,
  grabRate: 3,
  recruitRate: 0.08,
  friction: 0.12,
  lift: 0.03,
  wallFriction: 0.12,
  pullCone: 0.1,
  homeAging: 0.12,
  foodAging: 1.5,
  playerStrength: 1,
}
