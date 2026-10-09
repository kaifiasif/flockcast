import { cn } from "@/lib/utils"

/** The app's loading indicator: a 3×3 lattice of dots rippling corner to corner (styles in index.css). */
function Spinner({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span role="status" aria-label="Loading" className={cn("lattice size-4", className)} {...props}>
      {Array.from({ length: 9 }, (_, i) => (
        <i key={i} />
      ))}
    </span>
  )
}

export { Spinner }
