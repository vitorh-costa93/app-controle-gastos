import { LabelHTMLAttributes, SelectHTMLAttributes, InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

export function Label(props: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      {...props}
      className={cn("mb-1.5 block text-xs font-medium text-(--color-text-secondary)", props.className)}
    />
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "h-10 w-full rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 text-sm text-(--color-text-primary) outline-none focus:ring-2 focus:ring-(--color-primary)/30",
        className
      )}
    />
  );
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        "h-10 w-full rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 text-sm text-(--color-text-primary) outline-none focus:ring-2 focus:ring-(--color-primary)/30",
        className
      )}
    />
  );
}

export function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
    </div>
  );
}
