import { useState, useMemo } from 'react';
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
import { PricingTierEditor } from '@/components/PricingTierEditor';
import { PricePreview } from '@/components/PricePreview';
import type { PricingMode, PricingSettings, PricingTier } from '@/lib/pricing';

/**
 * Company Settings — Stage 2A.
 *
 * Local UI state for now; Stage 2B persists to Supabase via TanStack Query
 * once auth is wired. Every change to the pricing config flows live into
 * the PricePreview component below so you can sanity-check before saving.
 *
 * Sections:
 *  - Pricing mode (markup vs margin) + flat-rate / tiered toggle
 *  - Tier editor (when tiered)
 *  - Live preview
 *  - State sales tax
 *  - Labor rates (1-tech / 2-tech, standard + PPP)
 *  - Overhead allocation
 *  - Generator electrical default
 *  - Supplier (FW Webb) cost basis
 */
type SubMode = 'in_house' | 'subbed';
type RateMode = 'flat' | 'tiered';

export default function Settings() {
  // ---------- PRICING MODE ----------
  const [pricingMode, setPricingMode] = useState<PricingMode>('markup');
  const [rateMode, setRateMode] = useState<RateMode>('flat');
  const [defaultMarkup, setDefaultMarkup] = useState(0.5);
  const [defaultMargin, setDefaultMargin] = useState(0.4);

  // Default tier sets — sensible starting point lifted from contractor
  // flat-rate book convention, editable by the user.
  const [markupTiers, setMarkupTiers] = useState<PricingTier[]>([
    { max_cost_cents: 20000, rate: 2.0 },
    { max_cost_cents: 30000, rate: 1.5 },
    { max_cost_cents: 50000, rate: 1.0 },
    { max_cost_cents: null, rate: 0.67 },
  ]);
  const [marginTiers, setMarginTiers] = useState<PricingTier[]>([
    { max_cost_cents: 20000, rate: 0.6 },
    { max_cost_cents: 50000, rate: 0.5 },
    { max_cost_cents: null, rate: 0.4 },
  ]);

  // ---------- TAX ----------
  const [stateTax, setStateTax] = useState(0.0625); // MA

  // ---------- LABOR ----------
  const [laborOneTech, setLaborOneTech] = useState(22500); // $225/hr
  const [laborTwoTech, setLaborTwoTech] = useState(30000); // $300/hr
  const [laborOneTechPpp, setLaborOneTechPpp] = useState(20000); // $200/hr
  const [laborTwoTechPpp, setLaborTwoTechPpp] = useState(27500); // $275/hr

  // ---------- OVERHEAD ----------
  const [overheadPerHour, setOverheadPerHour] = useState(2500); // $25/hr

  // ---------- GENERATOR ELECTRICAL ----------
  const [subMode, setSubMode] = useState<SubMode>('subbed');
  const [defaultSubRate, setDefaultSubRate] = useState(150000); // $1500

  // ---------- LIVE PRICING SETTINGS (fed to PricePreview) ----------
  const livePricingSettings: PricingSettings = useMemo(
    () => ({
      pricing_mode: pricingMode,
      default_markup: defaultMarkup,
      default_margin: defaultMargin,
      // Empty tiers = flat-rate mode (engine falls back to defaults)
      markup_tiers: rateMode === 'tiered' ? markupTiers : [],
      margin_tiers: rateMode === 'tiered' ? marginTiers : [],
      state_tax_rate: stateTax,
      cost_basis: 'pre_tax',
    }),
    [
      pricingMode,
      rateMode,
      defaultMarkup,
      defaultMargin,
      markupTiers,
      marginTiers,
      stateTax,
    ],
  );

  return (
    <div className="px-4 py-6 flex flex-col gap-5">
      <header>
        <h1>Settings</h1>
        <p className="text-sm text-[var(--color-muted)] mt-1">
          Your numbers. Apply to every quote automatically.
        </p>
      </header>

      {/* ============ PRICING ============ */}
      <Card>
        <CardHeader>
          <CardTitle>Pricing</CardTitle>
        </CardHeader>
        <div className="flex flex-col gap-5">
          <Toggle
            label="Mode"
            options={[
              { value: 'markup', label: 'Markup' },
              { value: 'margin', label: 'Margin' },
            ]}
            value={pricingMode}
            onChange={setPricingMode}
            hint={
              pricingMode === 'markup'
                ? 'Price = cost × (1 + markup %)'
                : 'Price = cost ÷ (1 − margin %)'
            }
          />

          <Toggle
            label="Rate structure"
            options={[
              { value: 'flat', label: 'Flat rate' },
              { value: 'tiered', label: 'Tiered' },
            ]}
            value={rateMode}
            onChange={setRateMode}
            hint={
              rateMode === 'tiered'
                ? 'Different rates by cost bracket — small parts higher, big-ticket lower.'
                : 'One rate applied to every line item.'
            }
          />

          {rateMode === 'flat' ? (
            pricingMode === 'markup' ? (
              <PercentInput
                label="Default markup"
                value={defaultMarkup}
                onChange={setDefaultMarkup}
                hint="Applied to every material line."
              />
            ) : (
              <PercentInput
                label="Target gross margin"
                value={defaultMargin}
                onChange={setDefaultMargin}
                hint="Applied to every material line."
              />
            )
          ) : (
            <PricingTierEditor
              mode={pricingMode}
              tiers={pricingMode === 'markup' ? markupTiers : marginTiers}
              onChange={pricingMode === 'markup' ? setMarkupTiers : setMarginTiers}
            />
          )}
        </div>
      </Card>

      {/* ============ LIVE PREVIEW ============ */}
      <Card>
        <CardHeader>
          <CardTitle>Live preview</CardTitle>
        </CardHeader>
        <PricePreview settings={livePricingSettings} />
      </Card>

      {/* ============ STATE TAX ============ */}
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

      {/* ============ LABOR ============ */}
      <Card>
        <CardHeader>
          <CardTitle>Labor Rates</CardTitle>
        </CardHeader>
        <div className="grid grid-cols-2 gap-3">
          <MoneyInput label="1-tech / hr" value={laborOneTech} onChange={setLaborOneTech} />
          <MoneyInput label="2-tech / hr" value={laborTwoTech} onChange={setLaborTwoTech} />
          <MoneyInput label="PPP 1-tech / hr" value={laborOneTechPpp} onChange={setLaborOneTechPpp} />
          <MoneyInput label="PPP 2-tech / hr" value={laborTwoTechPpp} onChange={setLaborTwoTechPpp} />
        </div>
        <p className="text-xs text-[var(--color-muted)] mt-3">
          HVAC replacements default to 2-tech pricing.
        </p>
      </Card>

      {/* ============ OVERHEAD ============ */}
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

      {/* ============ GENERATOR ELECTRICAL ============ */}
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

      {/* ============ WEBB SUPPLIER ============ */}
      <Card>
        <CardHeader>
          <CardTitle>Supplier — FW Webb</CardTitle>
        </CardHeader>
        <div className="flex flex-col gap-4">
          <Select label="Cost basis" defaultValue="pre_tax" disabled>
            <option value="pre_tax">Pre-tax (TradeVision adds state tax)</option>
            <option value="post_tax">Post-tax (already includes tax)</option>
          </Select>
          <Input label="Account number" placeholder="Pending Webb integration" disabled />
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
