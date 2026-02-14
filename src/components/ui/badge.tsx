import { cva, type VariantProps } from "class-variance-authority"
import type * as React from "react"
import { cn } from "../../lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border border-[hsl(var(--border))] font-medium transition-colors cursor-pointer",
  {
    variants: {
      variant: {
        default: "bg-[hsl(var(--card))] text-[hsl(var(--foreground))]",
        active: "bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]",
      },
      size: {
        sm: "px-2.5 py-0.5 text-sm",
        default: "px-4 py-2 text-lg",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, size, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant, size, className }))} {...props} />
}

export { Badge, badgeVariants }
