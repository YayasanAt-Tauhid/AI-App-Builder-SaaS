/**
 * ui.tsx — Barrel for the ShadCN/UI primitives (PRD §6.11, §8.1).
 *
 * The primitives now live in `components/ui/*` and are built the canonical
 * ShadCN way — Radix UI primitives + class-variance-authority + tailwind-merge,
 * dark-first via the design tokens in globals.css. This barrel re-exports them
 * so existing `@/components/ui` imports keep working unchanged.
 */
export { Button, buttonVariants, type ButtonProps } from "@/components/ui/button";
export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
export { Input } from "@/components/ui/input";
export { Textarea } from "@/components/ui/textarea";
export { Badge, badgeVariants, type BadgeProps } from "@/components/ui/badge";
export { Spinner } from "@/components/ui/spinner";
export { Label } from "@/components/ui/label";
export {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
export { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
