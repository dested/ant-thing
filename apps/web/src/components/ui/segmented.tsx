import { cn } from '~/lib/utils'

// One choice out of a few, as joined buttons. `aria-pressed` carries the state.
function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (value: T) => void
  className?: string
}) {
  return (
    <div
      role="group"
      aria-label={label}
      data-slot="segmented"
      className={cn('inline-flex rounded-md border border-input', className)}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          className="tabular h-8 flex-1 cursor-pointer border-l border-input px-2.5 text-sm font-medium whitespace-nowrap outline-none first:rounded-l-[3px] first:border-l-0 last:rounded-r-[3px] hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-pressed:bg-foreground aria-pressed:text-background">
          {option.label}
        </button>
      ))}
    </div>
  )
}

// A view layer that is on or off.
function Chip({
  pressed,
  onChange,
  className,
  children,
}: {
  pressed: boolean
  onChange: (pressed: boolean) => void
  className?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      data-slot="chip"
      onClick={() => onChange(!pressed)}
      className={cn(
        'inline-flex h-8 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-input px-2.5 text-sm font-medium outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background',
        className
      )}>
      {children}
    </button>
  )
}

export { Chip, Segmented }
