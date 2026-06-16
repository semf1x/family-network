import { BadgeCheck } from "lucide-react"

export default function VerifiedBadge({ size = 16 }: { size?: number }) {
  return (
    <BadgeCheck
      size={size}
      className="text-primary shrink-0"
      aria-label="Верифицирован"
    />
  )
}
