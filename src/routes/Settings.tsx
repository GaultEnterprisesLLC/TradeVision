import { useState } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  Input,
  MoneyInput,
  PercentInput,
  Toggle,
  Select,
  Button,
} from '@/components/ui';

/**
 * Company Settings — Stage 1.
 *
 * This is the foundation every quote runs on. Local UI state for now;
 * Stage 2 will persist to the `companies` and `company_settings` tables
 * in Supabase via TanStack Query.
 *
 * Sections:
 *  - Company identity (name, address, contact, logo, license)
 *  - Pricing mode (markup vs margin)
 *  - State sales tax (applied to pre-tax Webb costs)
 *  - Labor rates (1-tech / 2-tech, by tier — flat per-task in v1)
 *  - Tech tiers (Master, Lead, Apprentice, etc.)
 *  - Overhead allocation ($ per labor-hour, configurable later)
 *  - Supplier defaults (Webb pre-tax flag, default sub electrical rate)
 */
type PricingMode = 'markup' | 'margin';
type SubMode = 'in_house' | 'subbed';

export default function Settings() {
  // Pricing
  const [pricingMode, setPricingMode] = useState<PricingMode>('markup');
  const [defaultMarkup, setDefaultMarkup] = useState(0.5); // 50%
  const [defaultMargin, setDefaultMargin] = useState(0.4); // 40%
  const [stateTax, setStateTax] = useState(0.0625); // MA

  // Labor
  const [laborOneTech, setLaborOneTech] = useState(22500); // $225.00
  const [laborTwoTech, setLaborTwoTech] = useState(30000); // $300.00
  const [laborOneTechPpp, setLaborOneTechPpp] = useState(20000); // $200.00
  const [laborTwoTechPpp, setLaborTwoTechPpp] = useState(27500); // $275.00

  // Overhead
  const [overheadPerHour, setOverheadPerHour] = useState(2500); // $25/hr placeholder

  // Generator electrical default
  const [subMode, setSubMode] = useState<SubMode>('subbed');
  const [defaultSubRate, setDefaultSubRate] = useState(150000); // $1500 placeholder

  return (
    <div className="px-4 py-6 flex flex-col gap-5">
      <header>
        <h1>Settings</h1>
        <p className="text-sm text-[var(--color-muted)] mt-1">
          Your numbers. Apply to every quote automatically.
        </p>
      </header>

      {/* PRICING MODE */}
      <Card>
        <CardHeader>
          <CardTitle>Pricing Mode</CardTitle>
        </CardHeader>
        <div className="flex flex-col gap-4">
          <Toggle
            label="Default mode"
            options={[
              { value: 'markup', label: 'Markup' },
              { value: 'margin', label: 'Margin' },
            ]}
            value={pricingMode}
            onChange={setPricingMode}
            hint={
              pricingMode === 'markup'
                ? 'Customer price = cost × (1 + markup %)'
                : 'Customer price = cost ÷ (1 − margin %)'
            }
          />
          {pricingMode === 'markup' ? (
            <PercentInput
              label="Default markup"
              value={defaultMarkup}
              onChange={setDefaultMarkup}
              hint="Applied to Webb cost basis (post-tax)."
            />
          ) : (
            <PercentInput
              label="Target gross margin"
              value={defaultMargin}
              onChange={setDefaultMargin}
              hint="Applied to Webb cost basis (post-tax)."
            />
          )}
        </div>
      </Card>

      {/* STATE TAX */}
      <Card>
        <CardHeader>
          <CardTitle>State Sales Tax</CardTitle>
        </CardHeader>
        <PercentInput
          label="Sales tax rate"
          value={stateTax}
          onChange={setStateTax}
          hint="Applied to pre-tax supplier prices to produce cost basis."
        />
      </Card>

      {/* LABOR */}
      <Card>
        <CardHeader>
          <CardTitle>Labor Rates</CardTitle>
        </CardHeader>
        <div className="grid grid-cols-2 gap-3">
          <MoneyInput
            label="1-tech rate / hr"
            value={laborOneTech}
            onChange={setLaborOneTech}
          />
          <MoneyInput
            label="2-tech rate / hr"
            value={laborTwoTech}
            onChange={setLaborTwoTech}
          />
          <MoneyInput
            label="PPP 1-tech / hr"
            value={laborOneTechPpp}
            onChange={setLaborOneTechPpp}
          />
          <MoneyInput
            label="PPP 2-tech / hr"
            value={laborTwoTechPpp}
            onChange={setLaborTwoTechPpp}
          />
        </div>
        <p className="text-xs text-[var(--color-muted)] mt-3">
          HVAC replacements default to 2-tech pricing.
        </p>
      </Card>

      {/* OVERHEAD */}
      <Card>
        <CardHeader>
          <CardTitle>Overhead Allocation</CardTitle>
        </CardHeader>
        <MoneyInput
          label="Per labor hour"
          value={overheadPerHour}
          onChange={setOverheadPerHour}
          hint="Allocated to every job based on flat task hours."
        />
      </Card>

      {/* GENERATOR / SUB DEFAULTS */}
      <Card>
        <CardHeader>
          <CardTitle>Generator Electrical</CardTitle>
        </CardHeader>
        <div className="flex flex-col gap-4">
          <Toggle
            label="Default scope"
            options={[
              { value: 'subbed', label: 'Subbed' },
              { value: 'in_house', label: 'In-house' },
            ]}
            value={subMode}
            onChange={setSubMode}
            hint="Per-job override available on every generator quote."
          />
          {subMode === 'subbed' && (
            <MoneyInput
              label="Default sub rate (pre-fill)"
              value={defaultSubRate}
              onChange={setDefaultSubRate}
              hint="Editable per job. Includes panel work and ATS install."
            />
          )}
        </div>
      </Card>

      {/* WEBB SUPPLIER */}
      <Card>
        <CardHeader>
          <CardTitle>Supplier — FW Webb</CardTitle>
        </CardHeader>
        <div className="flex flex-col gap-4">
          <Select label="Cost basis" defaultValue="pre_tax" disabled>
            <option value="pre_tax">Pre-tax (TradeVision adds state tax)</option>
            <option value="post_tax">Post-tax (already includes tax)</option>
          </Select>
          <Input
            label="Account number"
            placeholder="Pending Webb integration"
            disabled
          />
          <p className="text-xs text-[var(--color-muted)]">
            Direct API integration is in progress. Until live, Webb pricing
            loads from a CSV import or manual entry.
          </p>
        </div>
      </Card>

      <Button fullWidth size="lg">
        Save Settings
      </Button>
    </div>
  );
}
