import { HTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) shadow-(--shadow-sm)",
        className
      )}
      {...props}
    />
  );
}
