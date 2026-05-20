import { Play } from "lucide-react";
import { cn } from "@/lib/utils";

export function VideoFrame({
  className,
  thumbnailClass,
  label
}: {
  className?: string;
  thumbnailClass: string;
  label?: string;
}) {
  return (
    <div
      className={cn(
        "frame-noise relative aspect-video overflow-hidden rounded-md border border-white/30 shadow-inner",
        thumbnailClass,
        className
      )}
    >
      <div className="absolute inset-x-3 top-3 z-10 flex items-center justify-between">
        <span className="rounded bg-black/28 px-2 py-1 text-[10px] font-medium text-white/90">
          {label ?? "PREVIEW"}
        </span>
        <span className="rounded bg-white/20 px-2 py-1 text-[10px] font-medium text-white/90">
          16:9
        </span>
      </div>
      <div className="absolute inset-0 z-10 grid grid-cols-3 grid-rows-3 opacity-30">
        {Array.from({ length: 9 }).map((_, index) => (
          <span key={index} className="border border-white/30" />
        ))}
      </div>
      <div className="absolute inset-x-5 bottom-4 z-20 flex items-center gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-foreground">
          <Play className="h-3.5 w-3.5 fill-current" />
        </span>
        <span className="h-1.5 flex-1 rounded-full bg-white/32">
          <span className="block h-full w-2/5 rounded-full bg-white" />
        </span>
      </div>
    </div>
  );
}
