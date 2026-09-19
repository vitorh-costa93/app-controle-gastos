import { Skeleton } from "@/components/ui/LoadingState";

export default function SimulacaoLoading() {
  return (
    <div>
      <div className="mb-6">
        <Skeleton className="h-7 w-36" />
        <Skeleton className="mt-2 h-4 w-80" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="flex flex-col gap-6">
          <Skeleton className="h-96 rounded-(--radius-lg)" />
          <Skeleton className="h-40 rounded-(--radius-lg)" />
        </div>
        <div className="flex flex-col gap-6">
          <Skeleton className="h-64 rounded-(--radius-lg)" />
          <Skeleton className="h-48 rounded-(--radius-lg)" />
        </div>
      </div>
    </div>
  );
}
