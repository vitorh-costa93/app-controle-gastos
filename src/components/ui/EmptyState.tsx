import { ReactNode } from "react";

export function EmptyState({
  icon,
  title,
  action,
}: {
  icon?: ReactNode;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-(--radius-lg) border border-dashed border-(--color-border) bg-(--color-surface) px-6 py-16 text-center">
      {icon && <div className="text-(--color-text-tertiary)">{icon}</div>}
      <p className="max-w-sm text-sm text-(--color-text-secondary)">{title}</p>
      {action}
    </div>
  );
}
