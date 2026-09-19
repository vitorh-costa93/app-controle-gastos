import { ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
      <div>
        <h1 className="text-[26px] font-semibold tracking-tight text-(--color-text-primary)">
          {title}
        </h1>
        <p className="mt-1 max-w-xl text-sm text-(--color-text-secondary)">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}
