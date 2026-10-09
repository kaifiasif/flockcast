import type { UseQueryResult } from '@tanstack/react-query';
import { AlertCircleIcon, RotateCwIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { errorMessage } from '@/api/errors';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

/** Renders a query's three states the same way everywhere: skeleton, error with retry, or the data. */
export function QueryView<T>({ query, loading, children }: { query: UseQueryResult<T>; loading: ReactNode; children: (data: T) => ReactNode }) {
  if (query.isPending) return <>{loading}</>;
  if (query.isError) return <ErrorAlert error={query.error} onRetry={() => void query.refetch()} />;
  return <>{children(query.data)}</>;
}

export function ErrorAlert({ error, onRetry, title = 'This could not load' }: { error: unknown; onRetry?: () => void; title?: string }) {
  return (
    <Alert variant="destructive">
      <AlertCircleIcon />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <p>{errorMessage(error)}</p>
        {onRetry && (
          <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
            <RotateCwIcon /> Try again
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
