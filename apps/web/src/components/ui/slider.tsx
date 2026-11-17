import { Slider as SliderPrimitive } from '@base-ui/react/slider'
import { cn } from '~/lib/utils'

// An instrument slider: a hairline scale, the travelled part drawn heavier, a bar for a thumb.
function Slider({ className, ...props }: SliderPrimitive.Root.Props<number>) {
  return (
    <SliderPrimitive.Root data-slot="slider" className={cn('w-full', className)} {...props}>
      <SliderPrimitive.Control className="flex h-6 w-full cursor-pointer touch-none items-center select-none">
        <SliderPrimitive.Track className="relative h-px w-full bg-foreground/35">
          <SliderPrimitive.Indicator className="-top-px h-[3px] bg-foreground" />
          {/* The label names the range input too, which is what a screen reader lands on. */}
          <SliderPrimitive.Thumb
            aria-label={props['aria-label']}
            className="h-4 w-1.5 rounded-[1px] bg-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
        </SliderPrimitive.Track>
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  )
}

export { Slider }
