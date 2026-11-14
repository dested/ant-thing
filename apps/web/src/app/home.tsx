import { requirePreset } from '@app/sim'
import { Lab } from '~/sim/lab'

const piano = requirePreset('piano-movers')

export function HomePage() {
  return <Lab puzzle={piano.puzzle} title="The piano movers" />
}
