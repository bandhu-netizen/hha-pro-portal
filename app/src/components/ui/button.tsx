import type { ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 font-medium transition-[background-color,transform,border-color,filter] duration-150 ease-out active:not-disabled:scale-[0.96] disabled:opacity-40 disabled:cursor-not-allowed select-none",
  {
    variants: {
      variant: {
        primary:
          "bg-accent text-accent-fg border border-accent hover:brightness-110",
        secondary:
          "bg-surface text-fg border border-line-strong hover:bg-surface-2",
        ghost: "bg-transparent text-fg border border-transparent hover:bg-line",
        danger: "bg-transparent text-crit border border-line-strong hover:bg-crit-soft",
      },
      size: {
        sm: "h-8 rounded-md px-3 text-xs",
        md: "h-9 rounded-md px-3.5 text-sm",
        lg: "h-11 rounded-lg px-4 text-sm",
        icon: "size-9 rounded-md",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export function Button({
  className,
  variant,
  size,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
