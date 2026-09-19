import { Skeleton } from "@/components/ui/LoadingState";

export default function AnaliseLoading() {
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Skeleton className="h-7 w-32" />
          <Skeleton className="mt-2 h-4 w-80" />
        </div>
        <Skeleton className="h-10 w-40 rounded-(--radius-md)" />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-(--radius-lg)" />
        ))}
      </div>

      <Skeleton className="mb-6 h-56 w-full rounded-(--radius-lg)" />
      <Skeleton className="mb-6 h-48 w-full rounded-(--radius-lg)" />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Skeleton className="h-40 rounded-(--radius-lg)" />
        <Skeleton className="h-40 rounded-(--radius-lg)" />
      </div>
    </div>
  );
}
