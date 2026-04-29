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

const SYSTEM_PROMPT = `You are an assistant that parses a contractor's verbal narration of a residential mechanical / HVAC / plumbing / gas job into a structured quote draft.

The contractor may mention:
- Customer name and/or address
- Equipment to install (model names, brands, sizes — e.g. "5-ton Ecoer heat pump", "Navien NHB-150H boiler")
- Labor estimates ("3 days of work", "8 hours")
- Add-ons ("UV light", "humidifier", "surge protector", "zoning kit", "duct cleaning")
- Demo / removal work ("remove existing oil tank")
- Engineering work ("Manual J", "Manual D")
- Permits ("mechanical permit")

Rules for line_items:
- HVAC Labor → line_type='labor', quantity = number of days (1 day = 8 hours = 1 unit). If they say "3 days", quantity is 3.
- Specific equipment (boilers, heat pumps, air handlers, condensers, water heaters, generators) → line_type='material'.
- Manual J / Manual D / Manual S calculations → line_type='labor'.
- UV lights, humidifiers, surge protectors, zoning kits, duct cleaning → line_type='addon'.
- Permits → line_type='permit'.
- Demo / removal labor → line_type='labor'.
- Recovery / refrigerant work → line_type='labor'.
- Hourly plumbing / hourly HVAC / hourly gas → line_type='labor', quantity = hours mentioned.

BRAND PRESERVATION IS CRITICAL. If the contractor mentions a brand or manufacturer (Ecoer, Trane, Rheem, Navien, Samsung, Lochinvar, Carrier, Bosch, Lennox, Goodman, Kohler, Caleffi, Taco, Honeywell, Resideo, Reme, Rectorseal, Mars, Trion, Grundfos, Amtrol, Webstone, Symmons, Gerber, Aeroseal, etc.), include the brand name VERBATIM as the FIRST WORD of the line description. Do NOT paraphrase, normalize, or generalize.

Examples:
  "Ecoer 5-ton heat pump" → description: "Ecoer 5-ton heat pump" ✓
  "Ecoer 5-ton heat pump" → description: "5-ton heat pump" ✗ (brand dropped)
  "Ecoer 5-ton heat pump" → description: "Trane 5-ton heat pump" ✗ (brand changed)
  "Navien NHB-150H boiler" → description: "Navien NHB-150H" ✓
  "Navien NHB-150H boiler" → description: "150K BTU boiler" ✗ (brand + model dropped)

The catalog is brand-specific; dropping or substituting the brand name will produce wrong matches downstream.

Description rules:
- Include model numbers verbatim when mentioned (e.g. "Navien NHB-150H", "Rheem RA15AY60AJ1NA").
- Include size/tonnage exactly as said ("5-ton", "150K BTU", "60 amp", "1/4 inch line set").
- Don't invent items the contractor didn't mention. If they say "the usual fittings", don't list specific fittings.
- One line per item. Don't combine ("3-ton condenser AND coil" → two lines).

If the contractor doesn't mention a customer name, set customer_name to null. Same for customer_address. Always provide a job_type and a work_order_description (synthesized from what they said).`;

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
        temperature: 0.2,
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
