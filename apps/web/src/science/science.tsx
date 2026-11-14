import { requirePreset } from '@app/sim'
import data from './data.json'
import { SweepChart, type Point } from './sweep-chart'

const piano = requirePreset('piano-movers').puzzle

/** What bench/science.ts writes. */
interface ScienceData {
  cap: number
  conformity: Point[]
  ants: Point[]
  informedTime: Point[]
  home: { scentOnly: Point; lineOnly: Point }
}
const science: ScienceData = data

const SOURCES = [
  {
    href: 'https://doi.org/10.1073/pnas.2414274121',
    text: 'Dreyer, Haluts, Korman, Gov, Fonio, Feinerman. Comparing cooperative geometric puzzle solving in ants versus humans. PNAS 122 (2025).',
  },
  {
    href: 'https://doi.org/10.1038/ncomms8729',
    text: 'Gelblum, Pinkoviezky, Fonio, Ghosh, Gov, Feinerman. Ant groups optimally amplify the effect of transiently informed individuals. Nature Communications 6 (2015).',
  },
  {
    href: 'https://doi.org/10.7554/eLife.20185',
    text: 'Fonio, Heyman, Boczkowski, Gelblum, Kosowski, Korman, Feinerman. A locally-blazed ant trail achieves efficient collective navigation despite limited information. eLife 5 (2016).',
  },
  {
    href: 'https://arxiv.org/abs/2107.09508',
    text: 'Gelblum, Pinkoviezky, Fonio, Gov, Feinerman. Emergent oscillations assist obstacle negotiation during ant cooperative transport. PNAS 113 (2016).',
  },
]

function Rule({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div className="border-t py-4">
      <dt className="font-display text-xl leading-tight font-bold">{name}</dt>
      <dd className="mt-1 max-w-[65ch] leading-relaxed">{children}</dd>
    </div>
  )
}

const of = (point: Point | undefined): string =>
  point ? `${point.delivered} of ${point.runs}` : ''

/** Below the lab: what the ants are doing, what the numbers say, and what was made up. */
export function Science() {
  const usual = science.conformity.find((point) => point.value === 1)
  const { scentOnly, lineOnly } = science.home
  const clueless = science.informedTime.find((point) => point.value === 0)
  return (
    <div className="border-t">
      <div className="mx-auto flex max-w-3xl flex-col gap-16 px-5 py-16">
        <section className="flex flex-col gap-4">
          <h2 className="font-display text-4xl leading-none font-extrabold">Ants against people</h2>
          <p className="max-w-[65ch] leading-relaxed">
            In 2025 a lab at the Weizmann Institute gave longhorn crazy ants and people the same
            job: get a T-shaped load through two narrow slits. One person beats one ant easily. But
            bigger groups of ants did better than small ones, and groups of people who were not
            allowed to talk did worse than one person alone.
          </p>
          <p className="max-w-[65ch] leading-relaxed">
            The arena above is that puzzle. Every ant in it follows the same few rules, taken from
            the lab’s papers. None of them knows what a wall is, and nothing plans the route.
          </p>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="font-display text-4xl leading-none font-extrabold">What one ant does</h2>
          <dl className="border-b">
            <Rule name="Bite and pull">
              An ant that finds a free spot on the edge of the load bites it. If her pull points
              away from the load she pulls. If it points into the load she lifts instead, which
              takes weight off the floor. Ants never push.
            </Rule>
            <Rule name="A newcomer knows the way">
              An ant who has just been walking free knows where the nest is. For about ten seconds
              after she bites she pulls toward it, a little off, each ant in her own way.
            </Rule>
            <Rule name="Then she goes along">
              After that she turns her pull toward the way her own corner of the load is already
              moving. The faster it moves, the more she agrees with it. This is the Conformity knob.
            </Rule>
            <Rule name="Scent">
              Real ants dab scent on the ground near the load to mark the way home. Here a mark is a
              number on the floor: how long ago the ant who left it was at the nest. A newcomer
              reads the way home off the marks around the load. Marks don’t carry through walls.
            </Rule>
            <Rule name="Letting go">
              A carrier lets go after about two minutes, sooner when her corner is stuck, and at
              once when the load presses her against a wall. Then she walks free, gets her bearings
              back, and may bite again as a newcomer.
            </Rule>
          </dl>
          <p className="max-w-[65ch] leading-relaxed">
            When the load jams, the ants who know the way keep pulling into the wall. The rest feel
            no movement to agree with, so each pulls her own way, and the load slides and swings
            along the wall until a corner finds the gap. Turn on Pulls and Forces to watch it
            happen.
          </p>
        </section>

        <section className="flex flex-col gap-10">
          <h2 className="font-display text-4xl leading-none font-extrabold">
            The colony is the clever part
          </h2>
          <p className="-mt-6 max-w-[65ch] leading-relaxed">
            Each bar is {usual?.runs ?? 0} colonies on the puzzle above, with one rule changed. A
            colony that hasn’t delivered after half an hour is called off.
          </p>
          <SweepChart
            title="Too little agreement and nothing moves, too much and nobody leads"
            axis="Conformity"
            points={science.conformity}
            cap={science.cap}
            standard={1}
            format={(value) => String(value)}
            setup={(value) => ({ puzzle: piano, rules: { conformity: value } })}
          />
          <SweepChart
            title="More ants do better"
            axis="Ants in the colony"
            points={science.ants}
            cap={science.cap}
            standard={piano.ants}
            format={(value) => String(value)}
            setup={(value) => ({ puzzle: { ...piano, ants: value }, rules: {} })}
          />
          <SweepChart
            title="A newcomer should lead, but not for long"
            axis="Seconds a newcomer pulls toward home"
            points={science.informedTime}
            cap={science.cap}
            standard={10}
            format={(value) => String(value)}
            setup={(value) => ({ puzzle: piano, rules: { informedTime: value } })}
          />
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="font-display text-4xl leading-none font-extrabold">
            What is real and what is guessed
          </h2>
          <dl className="border-b">
            <Rule name="The rules are from the papers, the numbers are mine">
              Newcomers who lead for seconds, carriers who conform, pullers in front and lifters
              behind, scent laid near the load: all measured on real ants. How strongly an ant
              conforms, how noisy her pull is and how long she holds on were tuned by me, on this
              puzzle, until colonies solved it.
            </Rule>
            <Rule name="Where home is">
              A newcomer’s idea of home is mostly the scent around the load, mixed with a straight
              line to the nest. Real ants keep a home vector too, but a straight line points through
              walls, and in this puzzle the slits happen to sit on it. With scent alone{' '}
              {of(scentOnly)} colonies deliver. With the mix the page uses, {of(usual)}. With the
              straight line alone, {of(lineOnly)}: on this layout the shortcut beats the trail, so
              the Scent trails switch makes them better when it is off. With newcomers who know
              nothing, {of(clueless)}.
            </Rule>
            <Rule name="Two rules I made up">
              A free ant that keeps walking into a wall gives up after about a second and turns
              around. A newcomer forgets the way four times faster while her corner of the load is
              stuck. Neither is from a paper. Without the first, ants pile up in corners.
            </Rule>
            <Rule name="The slits">
              They are 140 units wide. My first version used 126, and an exhaustive search of every
              position and angle showed this T can’t pass that at all. The same search is the
              Planner view, and it checks every puzzle before it is published.
            </Rule>
            <Rule name="The physics">
              Flat and rigid. The load moves only while it is pulled, and stops when the pulls
              cancel. Ants walk through each other. A colony here is a few hundred ants, not tens of
              thousands.
            </Rule>
            <Rule name="The times">
              A run can’t be replayed on the server, so a posted time is only checked against the
              fastest the load could possibly travel.
            </Rule>
          </dl>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="font-display text-4xl leading-none font-extrabold">Sources</h2>
          <ul className="flex flex-col gap-3">
            {SOURCES.map((source) => (
              <li key={source.href} className="max-w-[65ch] leading-relaxed">
                <a href={source.href} className="underline underline-offset-4">
                  {source.text}
                </a>
              </li>
            ))}
          </ul>
          <p className="max-w-[65ch] leading-relaxed">
            The code is on{' '}
            <a href="https://github.com/dested/ant-thing" className="underline underline-offset-4">
              GitHub
            </a>
            , MIT licensed. The charts come from{' '}
            <code className="font-mono text-sm">bench/science.ts</code>.
          </p>
        </section>
      </div>
    </div>
  )
}
