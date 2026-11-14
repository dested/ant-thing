import { Switch as SwitchPrimitive } from '@base-ui/react/switch'
import { cn } from '~/lib/utils'

function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        'inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-sm border border-input px-0.5 outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[checked]:border-foreground data-[checked]:bg-foreground',
        className
      )}
      {...props}>
      <SwitchPrimitive.Thumb className="size-3.5 rounded-[1px] bg-foreground transition-transform data-[checked]:translate-x-4 data-[checked]:bg-popover" />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
