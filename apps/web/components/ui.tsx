/**
 * ui.tsx — Lightweight, accessible UI primitives (PRD §6.11).
 *
 * A small ShadCN-style kit (Button, Card, Input, Textarea, Badge, Spinner)
 * built on Tailwind tokens so the whole app is dark-first and re-themeable.
 * Kept dependency-light and focused on the primitives this app actually uses,
 * with keyboard focus states and ARIA-friendly markup for WCAG AA.
 */
"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg" | "icon";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-primary-hover",
  secondary: "bg-surface2 text-foreground hover:brightness-110 border border-border",
  ghost: "bg-transparent text-foreground hover:bg-surface2",
  danger: "bg-danger text-white hover:brightness-110",
};
const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
  icon: "h-9 w-9 p-0",
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-[var(--radius)] font-medium transition",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
        "disabled:opacity-50 disabled:pointer-events-none",
        VARIANTS[variant],
        SIZES[size],
        className
      )}
      {...props}
    />
  );
}

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-[var(--radius)] border border-border bg-surface", className)}
      {...props}
    />
  );
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          "h-10 w-full rounded-[var(--radius)] border border-border bg-surface2 px-3 text-sm text-foreground",
          "placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          className
        )}
        {...props}
      />
    );
  }
);

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(
          "w-full rounded-[var(--radius)] border border-border bg-surface2 p-3 text-sm text-foreground",
          "placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary resize-none",
          className
        )}
        {...props}
      />
    );
  }
);

export function Badge({
  className,
  tone = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: "default" | "primary" | "success" | "danger" | "muted" }) {
  const tones = {
    default: "bg-surface2 text-foreground",
    primary: "bg-primary/15 text-primary",
    success: "bg-success/15 text-success",
    danger: "bg-danger/15 text-danger",
    muted: "bg-surface2 text-muted",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        tones[tone],
        className
      )}
      {...props}
    />
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn(
        "inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent",
        className
      )}
    />
  );
}
