import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardTitle, Button } from '@/components/ui';
import { useCompany } from '@/lib/queries/company';
import { useCreateQuote } from '@/lib/queries/quotes';
import type { Module } from '@/types/database';

const MODULES: { id: Module; name: string; flow: string; tagline: string }[] = [
  { id: 'hvac', name: 'HVAC Changeout', flow: 'video', tagline: 'Walkthrough → quote' },
  { id: 'water_heater', name: 'Water Heater', flow: 'photo', tagline: '1–3 photos → quote' },
  { id: 'boiler', name: 'Boiler', flow: 'photo', tagline: '1–5 photos → quote' },
  { id: 'generator', name: 'Generator', flow: 'video', tagline: 'Walkthrough → quote' },
];

/**
 * New quote — module picker.
 *
 * Stage 3A: each "Start" creates a draft `quotes` row with that module
 * and routes to /quotes/:id/edit. The guided per-module walkthrough
 * comes in 3B; for now the editor is generic.
 */
export default function New() {
  const navigate = useNavigate();
  const { data: company } = useCompany();
  const createQuote = useCreateQuote();
  const [pendingModule, setPendingModule] = useState<Module | null>(null);

  async function handleStart(module: Module) {
    if (!company) return;
    setPendingModule(module);
    try {
      const quote = await createQuote.mutateAsync({
        tenant_id: company.tenant_id,
        company_id: company.id,
        module,
      });
      navigate(`/quotes/${quote.id}/edit`);
    } catch {
      setPendingModule(null);
    }
  }

  return (
    <div className="px-4 py-6 flex flex-col gap-4">
      <h1>New Quote</h1>
      <p className="text-sm text-[var(--color-muted)]">
        Pick a job type. We'll guide you through the walkthrough.
      </p>

      {!company && (
        <p className="text-xs text-[var(--color-muted)]">
          Loading company…
        </p>
      )}

      {/* Narrate flow — voice-first, AI-built quote. Lives above the
          module list because it's the fastest path for ANY job type. */}
      <Card
        interactive
        onClick={() => company && navigate('/quotes/new/narrate')}
        className="border-[var(--color-green)]"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <CardTitle>Narrate the job</CardTitle>
            <p className="text-xs text-[var(--color-muted)] mt-1">
              Describe the work in plain English. AI builds the quote.
            </p>
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              if (company) navigate('/quotes/new/narrate');
            }}
            disabled={!company}
          >
            Start
          </Button>
        </div>
      </Card>

      <div className="text-xs uppercase tracking-wider text-[var(--color-muted)] mt-2">
        Or — manual module picker
      </div>

      <div className="flex flex-col gap-3">
        {MODULES.map((m) => {
          const pending = pendingModule === m.id;
          return (
            <Card key={m.id}>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>{m.name}</CardTitle>
                  <p className="text-xs text-[var(--color-muted)] mt-1">
                    {m.tagline}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleStart(m.id)}
                  disabled={!company || createQuote.isPending}
                >
                  {pending ? 'Starting…' : 'Start'}
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      {createQuote.error && (
        <p className="text-xs text-[var(--color-danger)]">
          Couldn't create quote: {createQuote.error.message}
        </p>
      )}
    </div>
  );
}
