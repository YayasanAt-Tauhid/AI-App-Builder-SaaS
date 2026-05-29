/** badge.tsx — ShadCN/UI badge (CVA). Keeps the app's `tone` vocabulary. */
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
  {
    variants: {
      tone: {
        default: "bg-secondary text-foreground",
        primary: "bg-primary/15 text-primary",
        success: "bg-success/15 text-success",
        danger: "bg-destructive/15 text-destructive",
        muted: "bg-secondary text-muted-foreground",
      },
    },
    defaultVariants: { tone: "default" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
