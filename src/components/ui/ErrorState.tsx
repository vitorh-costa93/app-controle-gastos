import { Button } from "./Button";

export function ErrorState({
  message = "Não foi possível carregar os dados. Tente novamente.",
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-(--radius-lg) border border-(--color-negative-soft) bg-(--color-negative-soft) px-6 py-10 text-center">
      <p className="text-sm text-(--color-negative)">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Tentar novamente
        </Button>
      )}
    </div>
  );
}
