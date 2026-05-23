import * as React from "react";
import { cn } from "@/lib/utils";

type BadgeTone = "neutral" | "green" | "amber" | "purple" | "red";

const tones: Record<BadgeTone, string> = {
  neutral: "border-border/80 bg-muted/80 text-muted-foreground",
  green: "border-emerald-500/30 bg-emerald-500/15 text-emerald-300",
  amber: "border-amber-500/30 bg-amber-500/15 text-amber-300",
  purple: "border-violet-500/35 bg-violet-500/15 text-violet-300",
  red: "border-red-500/35 bg-red-500/15 text-red-300"
};

export function Badge({
  className,
  tone = "neutral",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium leading-5",
        tones[tone],
        className
      )}
      {...props}
    />
  );
}
