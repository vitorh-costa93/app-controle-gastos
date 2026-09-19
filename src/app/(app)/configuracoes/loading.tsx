import { Skeleton } from "@/components/ui/LoadingState";

export default function ConfiguracoesLoading() {
  return (
    <div>
      <div className="mb-6">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="mt-2 h-4 w-72" />
      </div>

      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-(--radius-lg)" />
          ))}
        </div>
        <Skeleton className="h-40 rounded-(--radius-lg)" />
        <Skeleton className="h-32 rounded-(--radius-lg)" />
      </div>
    </div>
  );
}
