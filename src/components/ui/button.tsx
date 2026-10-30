import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const buttonStyles = cva(
  "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-60",
  {
    variants: {
      variant: {
        primary:
          "bg-royal-600 text-white shadow-[0_10px_22px_-14px_rgba(36,84,224,.85)] hover:bg-royal-700 hover:shadow-[0_14px_26px_-14px_rgba(36,84,224,.9)]",
        secondary:
          "bg-white text-navy-900 ring-1 ring-inset ring-line shadow-[0_1px_2px_rgba(63,55,38,.05)] hover:bg-[#fffdf8] hover:ring-navy-100",
        outline: "bg-transparent text-royal-700 ring-1 ring-inset ring-royal-200 hover:bg-royal-50",
        ghost: "bg-transparent text-navy-700 hover:bg-navy-50",
        subtle: "bg-royal-50 text-royal-700 hover:bg-royal-100",
        danger: "bg-rose-600 text-white hover:bg-rose-700",
      },
      size: {
        sm: "h-9 px-4 text-sm",
        md: "h-11 px-5 text-sm",
        lg: "h-12 px-6 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonStyles>;

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonStyles({ variant, size }), className)} {...props} />;
}
