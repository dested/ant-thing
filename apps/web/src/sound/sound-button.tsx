import { Volume2, VolumeX } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { cn } from '~/lib/utils'
import { sound, useSound } from './sound'

/** The one switch for every sound on the site. */
export function SoundButton({ className }: { className?: string }) {
  const on = useSound()
  return (
    <Button
      size="icon"
      variant="outline"
      aria-label="Sound"
      aria-pressed={on}
      onClick={() => sound.setOn(!on)}
      className={cn('size-8 shrink-0 border-input bg-transparent shadow-none', className)}>
      {on ? <Volume2 /> : <VolumeX />}
    </Button>
  )
}
