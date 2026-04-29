/**
 * /api/parse-narration — Edge Function
 * =====================================================================
 * Takes a contractor's narration of a job ("Mr. Smith at 12 Pleasant
 * Street, installing a 5-ton Ecoer heat pump, three days of labor…")
 * and returns a structured quote draft via OpenAI's strict JSON schema
 * mode.
 *
 * The frontend then fuzzy-matches each line_item.description against
 * the tenant's `items` catalog to produce a fully-priced draft.
 *
 * Why an Edge Function: the OPENAI_API_KEY must never reach the
 * browser. This server-side hop keeps it in process.env.
 *
 * Why OpenAI (not Gemini): we evaluated both; OpenAI's strict JSON
 * schema mode (response_format.type='json_schema' + strict:true) gives
 * the most reliable structured-output guarantees in the industry. For
 * a brand-sensitive extraction task ("preserve 'Ecoer' verbatim") the
 * extra reliability matters. Gemini stays in the architecture for the
 * future video-walkthrough path (Stage 4C) where its native
 * multimodal video+audio input is the simpler integration.
 *
 * TODO (post-trial): add Supabase JWT verification on the Authorization
 * header so this can't be hit by random callers burning through the
 * OpenAI quota. Acceptable for the single-user trial today; required
 * before any tenant beyond Gault touches it.
 * =====================================================================
 */

export const config = {
  runtime: 'edge',
};

const OPENAI_MODEL = 'gpt-5.4-mini';
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

/**
 * Strict JSON Schema returned to OpenAI. Constraints under strict mode:
 *  - Every object must have additionalProperties: false
 *  - Every property must appear in `required` (no optional fields)
 *  - To express "may be absent", use a union with null: type: ['string', 'null']
 *
 * OpenAI guarantees the response will be valid JSON conforming to this
 * schema — not a "best effort", a hard contract enforced by the model.
 */
const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    customer_name: {
      type: ['string', 'null'],
      description:
        "Customer's name if the contractor mentioned one. null if not stated.",
    },
    customer_address: {
      type: ['string', 'null'],
      description:
        "Customer's address if the contractor mentioned one. null if not stated.",
    },
    job_type: {
      type: 'string',
      description:
        'Short noun phrase describing the job (e.g. "Heat pump installation", "Boiler replacement", "Bathroom remodel"). Always provide one based on the work described.',
    },
    work_order_description: {
      type: 'string',
      description:
        '1-2 sentence summary of the scope of work, customer-facing.',
    },
    line_items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          description: {
            type: 'string',
            description:
              'Specific item or service. Include brand/model/size verbatim when the contractor mentioned them — the system fuzzy-matches against a parts catalog where brand names are the primary signal.',
          },
          quantity: {
            type: 'number',
            description:
              'Quantity. For HVAC Labor (day-blocks), this is the NUMBER OF DAYS mentioned (1 day = 1 unit). For materials, the count.',
          },
          line_type: {
            type: 'string',
            enum: ['material', 'labor', 'overhead', 'permit', 'sub', 'addon'],
            description:
              'How the line prices: material = tier-marked-up parts; labor = pass-through hourly/daily work; permit = pass-through; addon = optional accessories (UV light, humidifier, surge protector, zoning).',
          },
        },
        required: ['description', 'quantity', 'line_type'],
        additionalProperties: false,
      },
      description:
        'Every distinct item or service the contractor mentioned. One per line.',
    },
  },
  required: [
    'customer_name',
    'customer_address',
    'job_type',
    'work_order_description',
    'line_items',
  ],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `You parse a contractor's narration of a residential mechanical / HVAC / plumbing / gas job into a structured quote draft. You are an EXTRACTOR, not a generator.

# RULE 1 — Extraction discipline (most important rule)

Output line_items ONLY for items the contractor LITERALLY mentioned. Every line_item must trace to a specific phrase in the narration.

- If the narration mentions 4 distinct items, output exactly 4 line_items. Never more.
- Do NOT add items based on what "usually goes" with the described work. If the narration is about a furnace + AC and doesn't say "water heater", DO NOT include a water heater.
- Do NOT duplicate items. Each distinct mention gets exactly one line_item.
- Empty line_items array is valid if the contractor only described scope without itemizing.

WRONG (hallucinated additions):
  Narration: "Replace the AC with a 3-ton system and install line set."
  Bad output: [{description:"3-ton AC"}, {description:"line set"}, {description:"thermostat"}, {description:"refrigerant"}]
                                                                    ^^ NOT MENTIONED ^^   ^^ NOT MENTIONED ^^
  Good output: [{description:"3-ton AC"}, {description:"line set"}]

# RULE 2 — Generic stays generic, specific stays specific

Use exactly the level of specificity the contractor used. Do NOT invent specifics they didn't say.

- "3-ton AC" → description: "3-ton AC condenser" (generic — keep it that way; downstream catalog matcher picks size)
- "Ecoer 3-ton heat pump" → description: "Ecoer 3-ton heat pump" (brand was said; preserve verbatim)
- "Navien NHB-150H boiler" → description: "Navien NHB-150H boiler" (model number was said; preserve verbatim)

WRONG (invented specifics):
  Narration: "3-ton AC system"
  Bad output: description: "Ecoer EAHDEN-24ABA" — NEVER invent a brand+model for a generic mention.

# RULE 3 — Brand preservation when said

If the contractor mentions a brand or manufacturer (Ecoer, Trane, Rheem, Navien, Samsung, Lochinvar, Carrier, Bosch, Lennox, Goodman, Kohler, Caleffi, Taco, Honeywell, Resideo, Reme, Rectorseal, Mars, Trion, Grundfos, Amtrol, Webstone, Symmons, Gerber, Burnham, Aeroseal, Insinkerator, etc.), include the brand name VERBATIM as the first word.

  "Ecoer 5-ton heat pump" → "Ecoer 5-ton heat pump" ✓
  "Ecoer 5-ton heat pump" → "5-ton heat pump" ✗ (brand dropped)
  "Ecoer 5-ton heat pump" → "Trane 5-ton heat pump" ✗ (brand changed)

# RULE 4 — line_type mapping

- Specific equipment (boilers, heat pumps, air handlers, condensers, water heaters, furnaces, generators, AC units, coils) → 'material'
- HVAC Labor (day blocks) → 'labor', quantity = number of days mentioned (1 day = 1 unit)
- Hourly labor (hourly HVAC, hourly plumbing, hourly gas) → 'labor', quantity = hours
- Manual J / Manual D / Manual S → 'labor'
- Demo / removal / refrigerant recovery → 'labor'
- UV light, humidifier, surge protector, zoning kit, duct cleaning → 'addon'
- Mechanical permits → 'permit'
- Subcontracted work (electrical sub, etc.) → 'sub'
- Misc materials (line set, line hide, venting, condensate components, neutralizer, fittings) → 'material'

# RULE 5 — Customer info

- customer_name: extract if mentioned; null if not.
- customer_address: extract if mentioned; null if not.
- job_type: always provide a short noun phrase ("Heat pump installation", "Boiler replacement", "Bathroom remodel").
- work_order_description: 1-2 sentence summary synthesized from what the contractor said.

# Self-check

Before outputting, verify: every line_item description maps to a specific phrase in the narration. If you can't point to the source phrase, the item is hallucinated — remove it.`;

interface ParseRequest {
  narration?: unknown;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  let body: ParseRequest;
  try {
    body = (await req.json()) as ParseRequest;
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const narration = typeof body.narration === 'string' ? body.narration.trim() : '';
  if (!narration) {
    return jsonResponse({ error: 'Missing or empty `narration` field' }, 400);
  }
  if (narration.length > 10_000) {
    return jsonResponse(
      { error: 'Narration too long (max 10,000 characters)' },
      400,
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return jsonResponse(
      { error: 'Server is missing OPENAI_API_KEY' },
      500,
    );
  }

  // ----- Call OpenAI Chat Completions with strict JSON schema -----
  let openaiBody: unknown;
  try {
    const openaiRes = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: narration },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'quote_draft',
            schema: RESPONSE_SCHEMA,
            strict: true,
          },
        },
        // Deterministic — no creativity. Combined with the strict
        // "extract only what's said" prompt, prevents the model from
        // helpfully filling in items it thinks "should" be there.
        temperature: 0,
      }),
    });
    openaiBody = await openaiRes.json();
    if (!openaiRes.ok) {
      return jsonResponse(
        { error: 'OpenAI error', detail: openaiBody },
        502,
      );
    }
  } catch (err) {
    return jsonResponse(
      { error: 'OpenAI request failed', detail: String(err) },
      502,
    );
  }

  // ----- Extract structured payload from response -----
  const choices = (openaiBody as { choices?: Array<{ message?: { content?: string } }> })
    .choices ?? [];
  const content = choices[0]?.message?.content;
  if (!content) {
    return jsonResponse(
      { error: 'Empty response from OpenAI', raw: openaiBody },
      502,
    );
  }

  // Strict mode guarantees valid JSON, but parse defensively.
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return jsonResponse(
      { error: 'OpenAI returned non-JSON', text: content },
      502,
    );
  }

  return jsonResponse(parsed, 200);
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
