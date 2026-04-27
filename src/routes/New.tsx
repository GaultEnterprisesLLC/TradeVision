import { Card, CardTitle, Button } from '@/components/ui';

const MODULES = [
  { id: 'hvac', name: 'HVAC Changeout', flow: 'video', tagline: 'Walkthrough → quote' },
  { id: 'water_heater', name: 'Water Heater', flow: 'photo', tagline: '1–3 photos → quote' },
  { id: 'boiler', name: 'Boiler', flow: 'photo', tagline: '1–5 photos → quote' },
  { id: 'generator', name: 'Generator', flow: 'video', tagline: 'Walkthrough → quote' },
] as const;

/**
 * New quote — module picker.
 * Stage 2 builds the actual flows for each module. Right now this
 * surface confirms the routing and module list display.
 */
export default function New() {
  return (
    <div className="px-4 py-6 flex flex-col gap-4">
      <h1>New Quote</h1>
      <p className="text-sm text-[var(--color-muted)]">
        Pick a job type. We'll guide you through the walkthrough.
      </p>
      <div className="flex flex-col gap-3 mt-2">
        {MODULES.map((m) => (
          <Card key={m.id} interactive>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>{m.name}</CardTitle>
                <p className="text-xs text-[var(--color-muted)] mt-1">
                  {m.tagline}
                </p>
              </div>
              <Button variant="secondary" size="sm">
                Start
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
