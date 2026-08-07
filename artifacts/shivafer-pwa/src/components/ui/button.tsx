import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-bold transition-all focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[0.96] relative overflow-hidden",
  {
    variants: {
      variant: {
        default:
          "text-black",
        destructive:
          "bg-destructive text-destructive-foreground",
        outline:
          "glass border border-white/10 text-foreground",
        secondary:
          "glass text-foreground",
        ghost: "hover:bg-white/5 text-foreground border border-transparent",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "min-h-10 px-5 py-2",
        sm: "min-h-8 rounded-lg px-3 text-xs",
        lg: "min-h-12 rounded-xl px-8 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, style, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"

    const isDefault = !variant || variant === "default"

    const goldGlassStyle: React.CSSProperties | undefined = isDefault ? {
      background: "linear-gradient(160deg, var(--btn-gold-from) 0%, var(--btn-gold-mid) 40%, var(--btn-gold-to) 100%)",
      boxShadow: [
        "inset 0 1px 0 rgba(255,255,255,0.45)",
        "inset 0 -1px 0 rgba(0,0,0,0.3)",
        "inset 1px 0 0 rgba(255,255,255,0.15)",
        "0 4px 20px rgba(240,192,64,0.3)",
        "0 1px 4px rgba(0,0,0,0.4)",
      ].join(", "),
      border: "1px solid rgba(255,255,255,0.2)",
      ...style,
    } : style

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        style={goldGlassStyle}
        {...props}
      >
        {/* Specular shimmer for default variant */}
        {isDefault && (
          <span
            className="pointer-events-none absolute inset-0 rounded-xl"
            style={{
              background: "linear-gradient(105deg, transparent 20%, rgba(255,255,255,0.25) 50%, transparent 80%)",
              mixBlendMode: "overlay",
            }}
          />
        )}
        {props.children}
      </Comp>
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
