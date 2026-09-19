import { Skeleton } from "@/components/ui/LoadingState";

export default function CadastroLoading() {
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Skeleton className="h-7 w-40" />
          <Skeleton className="mt-2 h-4 w-72" />
        </div>
        <Skeleton className="h-10 w-36 rounded-(--radius-md)" />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-(--radius-lg)" />
        ))}
      </div>

      <Skeleton className="mb-4 h-9 w-64 rounded-(--radius-md)" />

      <div className="overflow-hidden rounded-(--radius-lg) border border-(--color-border)">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-none border-b border-(--color-border) last:border-0" />
        ))}
      </div>
    </div>
  );
}
