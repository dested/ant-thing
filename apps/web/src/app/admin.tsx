import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { useTRPC } from '~/lib/trpc'

const KEY = 'ant-movers:admin'

function remembered(): string {
  try {
    return window.sessionStorage.getItem(KEY) ?? ''
  } catch {
    return ''
  }
}

/** Moderation: every published puzzle, with hide and delete. The token is the only way in. */
export function AdminPage() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [token, setToken] = useState('')
  const [typed, setTyped] = useState('')
  useEffect(() => setToken(remembered()), [])

  const list = useQuery({
    ...trpc.admin.puzzles.queryOptions({ token, page: 0 }),
    enabled: token !== '',
    retry: false,
  })
  const refresh = (): Promise<void> =>
    queryClient.invalidateQueries({ queryKey: trpc.admin.puzzles.queryKey() })
  const setHidden = useMutation(trpc.admin.setHidden.mutationOptions({ onSuccess: refresh }))
  const remove = useMutation(trpc.admin.remove.mutationOptions({ onSuccess: refresh }))

  const enter = (e: React.FormEvent): void => {
    e.preventDefault()
    try {
      window.sessionStorage.setItem(KEY, typed)
    } catch {
      // Private windows may refuse storage; the token still works until the tab closes.
    }
    setToken(typed)
  }

  if (token === '' || list.isError) {
    return (
      <form onSubmit={enter} className="mx-auto flex max-w-sm flex-col gap-3 px-5 py-16">
        <h1 className="font-display text-3xl leading-tight font-extrabold">Admin</h1>
        <Input
          type="password"
          aria-label="Admin token"
          placeholder="Admin token"
          autoComplete="off"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
        />
        {list.isError && (
          <p className="text-sm font-medium text-destructive">{list.error.message}</p>
        )}
        <Button type="submit" disabled={typed === ''}>
          Open
        </Button>
      </form>
    )
  }

  const rows = list.data?.rows ?? []
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 px-5 py-10">
      <h1 className="font-display text-3xl leading-tight font-extrabold">
        <span className="tabular">{list.data?.total ?? 0}</span> puzzles,{' '}
        <span className="tabular">{(list.data?.runs ?? 0).toLocaleString('en-US')}</span> runs
      </h1>
      {rows.length === 0 && !list.isPending && (
        <p className="text-muted-foreground">Nobody has published a puzzle yet.</p>
      )}
      <ul className="border-t">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b py-2.5">
            <Link
              to={`/p/${row.id}`}
              className="min-w-0 flex-1 truncate font-medium underline-offset-4 hover:underline">
              {row.title}
            </Link>
            <span className="tabular text-sm text-muted-foreground">
              {row.antRuns + row.handRuns} runs
              {row.reports > 0 && `, ${row.reports} reports`}
              {row.hidden && ', hidden'}
            </span>
            <span className="tabular text-sm text-muted-foreground">
              {row.createdAt.toISOString().slice(0, 10)}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={setHidden.isPending}
              onClick={() => setHidden.mutate({ token, id: row.id, hidden: !row.hidden })}
              className="border-input bg-transparent shadow-none">
              {row.hidden ? 'Show' : 'Hide'}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => {
                if (window.confirm(`Delete “${row.title}” and its runs for good?`))
                  remove.mutate({ token, id: row.id })
              }}>
              Delete
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}
