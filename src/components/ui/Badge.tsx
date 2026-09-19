import { cn } from "@/lib/utils/cn";

type BadgeTone = "neutral" | "positive" | "negative" | "info" | "warning";

const toneClasses: Record<BadgeTone, string> = {
  neutral: "bg-black/5 text-(--color-text-secondary)",
  positive: "bg-(--color-positive-soft) text-(--color-positive)",
  negative: "bg-(--color-negative-soft) text-(--color-negative)",
  info: "bg-(--color-primary-soft) text-(--color-primary)",
  warning: "bg-(--color-warning-soft) text-(--color-warning)",
};

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: BadgeTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium",
        toneClasses[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
