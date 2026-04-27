import { Card, CardTitle } from '@/components/ui';

/**
 * Quotes list — Stage 2.
 * For now, an empty-state placeholder so the navigation works end-to-end.
 */
export default function Quotes() {
  return (
    <div className="px-4 py-6 flex flex-col gap-4">
      <h1>Quotes</h1>
      <Card>
        <CardTitle>No quotes yet</CardTitle>
        <p className="text-sm text-[var(--color-muted)] mt-2">
          Tap the green <span className="text-[var(--color-green)]">+</span>{' '}
          below to start your first quote.
        </p>
      </Card>
    </div>
  );
}
