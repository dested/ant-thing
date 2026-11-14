import { describe, expect, test } from 'bun:test'
import { cleanTitle } from './titles'

describe('cleanTitle', () => {
  test('trims, collapses spaces and strips control characters', () => {
    expect(cleanTitle('  The   long\u0000 way\tround ')).toEqual({ title: 'The long way round' })
  })
  test('refuses short, long, linked and rude names', () => {
    expect('problem' in cleanTitle('ab')).toBe(true)
    expect('problem' in cleanTitle('x'.repeat(60))).toBe(true)
    expect('problem' in cleanTitle('see http://spam.example')).toBe(true)
    expect('problem' in cleanTitle('buy at spam.com')).toBe(true)
    expect('problem' in cleanTitle('f.u.c.k this maze')).toBe(true)
  })
  test('keeps ordinary names with punctuation', () => {
    expect(cleanTitle('Sofa, v2 (harder!)')).toEqual({ title: 'Sofa, v2 (harder!)' })
  })
})
