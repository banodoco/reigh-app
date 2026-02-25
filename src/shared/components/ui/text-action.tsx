import * as React from "react"
import { cn } from "@/shared/components/ui/contracts/cn"

interface TextActionProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode
}

const TextAction = React.forwardRef<HTMLButtonElement, TextActionProps>(
  ({ className, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      className={cn(
        "text-xs text-muted-foreground hover:text-foreground underline",
        className
      )}
      {...props}
    />
  )
)
TextAction.displayName = "TextAction"

export { TextAction }
