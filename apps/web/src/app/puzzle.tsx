import { preset } from '@app/sim'
import { data, useLoaderData, type LoaderFunctionArgs } from 'react-router'
import { Lab } from '~/sim/lab'

export function puzzleLoader({ params }: LoaderFunctionArgs): { id: string } {
  const id = params.id ?? ''
  if (!preset(id)) throw data('No puzzle here', { status: 404 })
  return { id }
}

export function PuzzlePage() {
  const { id } = useLoaderData<typeof puzzleLoader>()
  const found = preset(id)
  if (!found) return null
  return <Lab key={id} puzzle={found.puzzle} title={found.title} />
}
