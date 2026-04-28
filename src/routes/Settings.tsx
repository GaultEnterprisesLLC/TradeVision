import { useEffect, useMemo, useState } from 'react';
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
import {
  useCompany,
  useCompanySettings,
  useUpdateSettings,
} from '@/lib/queries/company';
import type { PricingMode, PricingSettings, PricingTier } from '@/lib/pricing';
import type { CompanySettings, ElectricalScope } from '@/types/database';

/**
 * Company Settings — Stage 2B.
 *
 * Loads from Supabase via TanStack Query, edits in local state, saves
 * back via mutation. The form initializes from the server snapshot
 * once, then drifts under user control until "Save settings" is clicked.
 *
 * Tier mode is inferred from the saved data: if either tier array has
 * rows, we render in tiered mode; otherwise flat-rate.
 */
type RateMode = 'flat' | 'tiered';

export default function Settings() {
  const { data: company, isLoading: companyLoading, error: companyError } = useCompany();
  const {
    data: serverSettings,
    isLoading: settingsLoading,
    error: settingsError,
  } = useCompanySettings(company?.id);
  const updateMutation = useUpdateSettings();

  // ---------- Local form state (initialized from server) ----------
  const [pricingMode, setPricingMode] = useState<PricingMode>('markup');
  const [rateMode, setRateMode] = useState<RateMode>('flat');
  const [defaultMarkup, setDefaultMarkup] = useState(0.5);
  const [defaultMargin, setDefaultMargin] = useState(0.4);
  const [markupTiers, setMarkupTiers] = useState<PricingTier[]>([]);
  const [marginTiers, setMarginTiers] = useState<PricingTier[]>([]);
  const [stateTax, setStateTax] = useState(0.0625);
  const [laborOneTech, setLaborOneTech] = useState(22500);
  const [laborTwoTech, setLaborTwoTech] = useState(30000);
  const [laborOneTechPpp, setLaborOneTechPpp] = useState(20000);
  const [laborTwoTechPpp, setLaborTwoTechPpp] = useState(27500);
  const [overheadPerHour, setOverheadPerHour] = useState(2500);
  const [subMode, setSubMode] = useState<ElectricalScope>('subbed');
  const [defaultSubRate, setDefaultSubRate] = useState(150000);

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [hydrated, setHydrated] = useState(false);

  // Initialize local state from server snapshot once, when settings arrive.
  useEffect(() => {
    if (!serverSettings || hydrated) return;
    hydrateFromServer(serverSettings);
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverSettings, hydrated]);

  function hydrateFromServer(s: CompanySettings) {
    setPricingMode(s.pricing_mode);
    setDefaultMarkup(Number(s.default_markup));
    setDefaultMargin(Number(s.default_margin));
    setMarkupTiers(s.markup_tiers ?? []);
    setMarginTiers(s.margin_tiers ?? []);
    setStateTax(Number(s.state_tax_rate));
    setLaborOneTech(s.labor_one_tech_cents);
    setLaborTwoTech(s.labor_two_tech_cents);
    setLaborOneTechPpp(s.labor_one_tech_ppp_cents);
    setLaborTwoTechPpp(s.labor_two_tech_ppp_cents);
    setOverheadPerHour(s.overhead_per_hour_cents);
    setSubMode(s.generator_electrical_default);
    setDefaultSubRate(s.default_sub_rate_cents);

    // Tier mode is inferred from server data
    const hasTiers =
      (s.pricing_mode === 'markup' && (s.markup_tiers ?? []).length > 0) ||
      (s.pricing_mode === 'margin' && (s.margin_tiers ?? []).length > 0);
    setRateMode(hasTiers ? 'tiered' : 'flat');
  }

  // Live snapshot for the preview.
  const livePricingSettings: PricingSettings = useMemo(
    () => ({
      pricing_mode: pricingMode,
      default_markup: defaultMarkup,
      default_margin: defaultMargin,
      markup_tiers: rateMode === 'tiered' ? markupTiers : [],
      margin_tiers: rateMode === 'tiered' ? marginTiers : [],
      state_tax_rate: stateTax,
      cost_basis: 'pre_tax',
    }),
    [pricingMode, rateMode, defaultMarkup, defaultMargin, markupTiers, marginTiers, stateTax],
  );

  async function handleSave() {
    if (!company) return;
    setSaveStatus('idle');
    try {
      await updateMutation.mutateAsync({
        companyId: company.id,
        patch: {
          pricing_mode: pricingMode,
          default_markup: defaultMarkup,
          default_margin: defaultMargin,
          markup_tiers: rateMode === 'tiered' ? markupTiers : [],
          margin_tiers: rateMode === 'tiered' ? marginTiers : [],
          state_tax_rate: stateTax,
          labor_one_tech_cents: laborOneTech,
          labor_two_tech_cents: laborTwoTech,
          labor_one_tech_ppp_cents: laborOneTechPpp,
          labor_two_tech_ppp_cents: laborTwoTechPpp,
          overhead_per_hour_cents: overheadPerHour,
          generator_electrical_default: subMode,
          default_sub_rate_cents: defaultSubRate,
        },
      });
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2500);
    } catch {
      setSaveStatus('error');
    }
  }

  // ---------- Render guards ----------
  if (companyLoading || settingsLoading) {
    return (
      <div className="px-4 py-12 text-center text-sm text-[var(--color-muted)]">
        Loading settings…
      </div>
    );
  }
  if (companyError || settingsError) {
    return (
      <div className="px-4 py-12 text-center">
        <p className="text-sm text-[var(--color-danger)] mb-2">
          Couldn't load settings.
        </p>
        <p className="text-xs text-[var(--color-muted)]">
          {companyError?.message || settingsError?.message}
        </p>
      </div>
    );
  }
  if (!company) {
    return (
      <div className="px-4 py-12 text-center">
        <p className="text-sm text-[var(--color-text)] mb-2">
          Your account isn't linked to a company yet.
        </p>
        <p className="text-xs text-[var(--color-muted)] max-w-sm mx-auto">
          Run migration 0004 in the Supabase SQL editor to link your sign-in
          to Gault Enterprises, then refresh.
        </p>
      </div>
    );
  }

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

      <div className="flex flex-col gap-2">
        <Button
          fullWidth
          size="lg"
          onClick={handleSave}
          disabled={updateMutation.isPending}
        >
          {updateMutation.isPending ? 'Saving…' : 'Save Settings'}
        </Button>
        {saveStatus === 'saved' && (
          <p className="text-sm text-[var(--color-green)] text-center">
            Settings saved.
          </p>
        )}
        {saveStatus === 'error' && (
          <p className="text-sm text-[var(--color-danger)] text-center">
            {updateMutation.error?.message ?? 'Save failed.'}
          </p>
        )}
      </div>
    </div>
  );
}
