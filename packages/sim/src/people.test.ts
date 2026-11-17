import { describe, expect, test } from 'bun:test'
import {
  decodeClient,
  decodeState,
  DEFAULT_PARAMS,
  DT,
  encodeClient,
  encodeState,
  Fields,
  gateLines,
  gatesPassed,
  PERSON_R,
  PERSON_WEIGHT,
  requirePreset,
  walkTo,
  World,
  type RoomState,
} from './index'

const piano = { ...requirePreset('piano-movers').puzzle, ants: 0 }
const open = { ...requirePreset('open-field').puzzle, ants: 0 }

describe('people', () => {
  test('a newcomer takes a free grip point and nobody stands shoulder to shoulder', () => {
    const world = new World(open, 1)
    const ids = Array.from({ length: 12 }, () => world.addPerson())
    const people = ids.map((id) => world.people[id])
    for (const person of people) expect(person?.site).toBeGreaterThanOrEqual(0)
    for (let i = 0; i < people.length; i++) {
      for (let j = i + 1; j < people.length; j++) {
        const a = people[i]
        const b = people[j]
        if (!a || !b) continue
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(PERSON_R * 1.5)
      }
    }
  })

  test('one person alone moves the load at the speed the weight rule promises', () => {
    const world = new World(open, 2)
    world.weight = PERSON_WEIGHT
    const id = world.addPerson()
    const person = world.people[id]
    if (!person) throw new Error('no person')
    person.px = 1
    const x0 = world.x
    for (let i = 0; i < 60; i++) world.step()
    // An off-centre pull also turns the load, so the centre moves a little slower than the grip.
    const top = DEFAULT_PARAMS.carrySpeed / (1 + PERSON_WEIGHT)
    expect(world.x - x0).toBeGreaterThan(top * 0.5)
    expect(world.x - x0).toBeLessThan(top * 1.01)
  })

  test('two people pulling opposite ways at the same place get nowhere', () => {
    const world = new World(open, 3)
    world.weight = PERSON_WEIGHT * 2
    const a = world.people[world.addPerson()]
    const b = world.people[world.addPerson()]
    if (!a || !b) throw new Error('no people')
    a.px = 1
    b.px = -1
    const x0 = world.x
    for (let i = 0; i < 120; i++) world.step()
    expect(Math.abs(world.x - x0)).toBeLessThan(6)
  })

  test('letting go frees the grip point, and it can be taken again', () => {
    const world = new World(open, 4)
    const id = world.addPerson()
    const site = world.people[id]?.site ?? -1
    expect(world.sites[site]?.occ).toBeGreaterThanOrEqual(0)
    world.drop(id)
    expect(world.sites[site]?.occ).toBe(-1)
    expect(world.people[id]?.site).toBe(-1)
    expect(world.hold(id)).toBe(true)
    world.removePerson(id)
    expect(world.people[id]).toBeNull()
    expect(world.sites.every((st) => st.occ < 0)).toBe(true)
  })

  test('a wall scrapes a holder off', () => {
    const world = new World(piano, 5)
    world.weight = PERSON_WEIGHT * 30
    const ids = Array.from({ length: 30 }, () => world.addPerson())
    // Everyone drags the load up into the top wall: whoever holds its top edge has nowhere to stand.
    for (const id of ids) {
      const person = world.people[id]
      if (person) person.py = -1
    }
    for (let i = 0; i < 60 * 40; i++) world.step()
    expect(ids.some((id) => world.people[id]?.site === -1)).toBe(true)
    expect(world.deepest).toBeLessThan(1)
    for (const id of ids) {
      const person = world.people[id]
      if (person) expect(world.fields.dist(person.x, person.y)).toBeGreaterThan(0)
    }
  })

  test('a walker slides along a wall and never ends up through it', () => {
    const fields = new Fields(piano.w, piano.h, piano.walls)
    const p = { x: 400, y: 100 }
    // Straight at the first slit wall (x = 490), well away from the slit.
    for (let i = 0; i < 200; i++) walkTo(fields, p, p.x + 20, p.y)
    expect(p.x).toBeLessThan(490)
    expect(fields.dist(p.x, p.y)).toBeGreaterThanOrEqual(PERSON_R * 0.5)
    // One huge jump is cut short at the wall too.
    const q = { x: 400, y: 100 }
    walkTo(fields, q, 900, 100)
    expect(q.x).toBeLessThan(490)
    // Through the slit is fine.
    const r = { x: 400, y: 350 }
    walkTo(fields, r, 600, 350)
    expect(r.x).toBeCloseTo(600, 0)
  })

  test('the piano-movers puzzle has two walls to get through, counted as the whole load clears each', () => {
    const gates = gateLines(piano)
    expect(gates).toEqual([490, 710])
    const world = new World(piano, 7)
    expect(gatesPassed(piano, gates, world.pieces)).toBe(0)
    world.pose(620, 350, Math.PI / 2)
    expect(gatesPassed(piano, gates, world.pieces)).toBe(1)
    // Lying across the first wall, in its slit: not through yet.
    world.pose(500, 350, 0)
    expect(gatesPassed(piano, gates, world.pieces)).toBe(0)
    world.pose(900, 350, Math.PI / 2)
    expect(gatesPassed(piano, gates, world.pieces)).toBe(2)
    expect(gateLines(open)).toEqual([])
  })

  test('with nobody in it the world steps without the colony code', () => {
    const world = new World(piano, 6)
    world.frozen = true
    for (let i = 0; i < 120; i++) world.step()
    expect(world.time).toBe(0)
    world.frozen = false
    for (let i = 0; i < 120; i++) world.step()
    expect(world.time).toBeCloseTo(120 * DT, 6)
  })
})

describe('wire', () => {
  test('client frames survive the trip', () => {
    const move = decodeClient(encodeClient({ op: 'move', x: 512.25, y: 33.5 }))
    expect(move).toEqual({ op: 'move', x: 512.25, y: 33.5 })
    const pull = decodeClient(encodeClient({ op: 'pull', px: 0.6, py: -0.8 }))
    if (pull?.op !== 'pull') throw new Error('not a pull')
    expect(pull.px).toBeCloseTo(0.6, 1)
    expect(pull.py).toBeCloseTo(-0.8, 1)
    expect(decodeClient(encodeClient({ op: 'grab' }))).toEqual({ op: 'grab' })
    expect(decodeClient(encodeClient({ op: 'drop' }))).toEqual({ op: 'drop' })
  })

  test('a pull can never be longer than 1', () => {
    const pull = decodeClient(Uint8Array.of(3, 127, 127))
    if (pull?.op !== 'pull') throw new Error('not a pull')
    expect(Math.hypot(pull.px, pull.py)).toBeLessThanOrEqual(1.0001)
  })

  test('junk is refused', () => {
    expect(decodeClient(new Uint8Array(0))).toBeNull()
    expect(decodeClient(Uint8Array.of(2, 1))).toBeNull()
    expect(decodeClient(Uint8Array.of(9))).toBeNull()
    expect(decodeClient(Uint8Array.of(4, 0))).toBeNull()
    expect(decodeState(Uint8Array.of(1, 0, 0))).toBeNull()
  })

  test('a room state survives the trip', () => {
    const state: RoomState = {
      started: true,
      over: false,
      gates: 2,
      time: 83.42,
      x: 512.5,
      y: 349.75,
      a: -2.5,
      weight: 3,
      people: [
        { id: 0, site: 131, x: 0, y: 0, px: 1, py: 0 },
        { id: 2, site: -1, x: 77.5, y: 640.25, px: 0, py: 0 },
      ],
    }
    const back = decodeState(encodeState(state))
    expect(back?.time).toBeCloseTo(83.42, 2)
    expect(back?.a).toBeCloseTo(-2.5, 3)
    expect(back?.x).toBe(512.5)
    expect(back?.started).toBe(true)
    expect(back?.over).toBe(false)
    expect(back?.gates).toBe(2)
    expect(back?.weight).toBe(3)
    expect(back?.people[0]).toEqual({ id: 0, site: 131, x: 0, y: 0, px: 1, py: 0 })
    expect(back?.people[1]).toEqual({ id: 2, site: -1, x: 77.5, y: 640.25, px: 0, py: 0 })
  })
})
