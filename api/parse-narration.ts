/**
 * /api/parse-narration — Edge Function
 * =====================================================================
 * Takes a contractor's narration of a job ("Mr. Smith at 12 Pleasant
 * Street, installing a 5-ton Ecoer heat pump, three days of labor…")
 * and returns a structured quote draft via Gemini's structured output.
 *
 * The frontend then fuzzy-matches each line_item.description against
 * the tenant's `items` catalog to produce a fully-priced draft.
 *
 * Why an Edge Function: the GEMINI_API_KEY must never reach the
 * browser. This server-side hop keeps it in process.env.
 *
 * TODO (post-trial): add Supabase JWT verification on the Authorization
 * header so this can't be hit by random callers burning through the
 * Gemini quota. Acceptable for the single-user trial today; required
 * before any tenant beyond Gault touches it.
 * =====================================================================
 */

export const config = {
  runtime: 'edge',
};

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

/**
 * JSON Schema returned to Gemini via responseSchema. Gemini guarantees
 * the response matches this shape (subject to the usual LLM caveats).
 */
const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    customer_name: {
      type: 'string',
      description: "Customer's name if mentioned. Empty string if not stated.",
    },
    customer_address: {
      type: 'string',
      description: "Customer's address if mentioned. Empty string if not stated.",
    },
    job_type: {
      type: 'string',
      description:
        'Short noun phrase describing the job (e.g. "Heat pump installation", "Boiler replacement", "Bathroom remodel"). Always provide one.',
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
              'Specific item or service. Include brand/model/size when the contractor mentioned them — the system fuzzy-matches against a parts catalog.',
          },
          quantity: {
            type: 'number',
            description:
              'Quantity. For HVAC Labor, this is the NUMBER OF DAYS mentioned (1 day = 1 unit). For materials, the count.',
          },
          line_type: {
            type: 'string',
            enum: ['material', 'labor', 'overhead', 'permit', 'sub', 'addon'],
            description:
              'How the line prices: material = tier-marked-up parts; labor = pass-through hourly/daily work; permit = pass-through; addon = optional accessories (UV light, humidifier, surge protector, zoning).',
          },
        },
        required: ['description', 'quantity', 'line_type'],
      },
    },
  },
  required: ['job_type', 'work_order_description', 'line_items'],
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

Description rules:
- Be specific. Include brand/model/size/tonnage when the contractor mentioned them — the description gets fuzzy-matched against a catalog of 879 items, so more detail = better match.
- Don't invent items the contractor didn't mention. If they say "the usual fittings", don't list specific fittings.
- One line per item. Don't combine ("3-ton condenser AND coil" → two lines).

Output ONLY the JSON object matching the schema. No prose, no explanations.`;

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

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return jsonResponse(
      { error: 'Server is missing GEMINI_API_KEY' },
      500,
    );
  }

  // ----- Call Gemini with structured output -----
  let geminiBody: unknown;
  try {
    const geminiRes = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: narration }],
          },
        ],
        systemInstruction: {
          parts: [{ text: SYSTEM_PROMPT }],
        },
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
    });
    geminiBody = await geminiRes.json();
    if (!geminiRes.ok) {
      return jsonResponse(
        { error: 'Gemini error', detail: geminiBody },
        502,
      );
    }
  } catch (err) {
    return jsonResponse(
      { error: 'Gemini request failed', detail: String(err) },
      502,
    );
  }

  // ----- Extract structured payload from response -----
  const candidates =
    (geminiBody as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> })
      .candidates ?? [];
  const text = candidates[0]?.content?.parts?.[0]?.text;
  if (!text) {
    return jsonResponse(
      { error: 'Empty response from Gemini', raw: geminiBody },
      502,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return jsonResponse(
      { error: 'Gemini returned non-JSON', text },
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
