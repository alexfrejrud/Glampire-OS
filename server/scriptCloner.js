/**
 * Script Formula Cloner — Grok text
 * Reverse-engineer short-form script structure, write new copy for a new idea.
 * Uses XAI_API_KEY only.
 */

const SYSTEM_PROMPT = `You are an expert short-form video scriptwriter and copy analyst. You will be given an ORIGINAL SCRIPT and a NEW VIDEO IDEA.

STEP 1 — Extract the formula (internal, do not output it):
Strip the original script down to an abstract blueprint. Identify, in the abstract, not in the original's words:
- Hook TYPE (e.g. bold claim, shocking stat, contrarian statement, direct callout of viewer, mystery/curiosity gap) — not the hook's actual wording.
- The section flow / beat structure (e.g. hook -> relatable problem -> agitate -> reveal mechanism -> proof -> payoff -> CTA), and roughly how many lines/seconds each beat gets.
- Sentence rhythm and pacing (short punchy lines vs longer explanatory ones, where pattern interrupts land, where the tone shifts).
- Persuasion techniques used (curiosity gaps, social proof, urgency, specificity, storytelling beats, callback lines, CTA style) — as techniques, not as text.
- Voice/tone (casual, urgent, authoritative, deadpan, etc).

Treat this as a formula/skeleton only. The original's specific topic, examples, numbers, product names, and phrasing are NOT part of the formula and must NOT carry over.

STEP 2 — Write a brand-new script:
Using ONLY the abstract blueprint from Step 1, write a completely original script for the NEW VIDEO IDEA. Invent new hook lines, new examples, new specifics, new phrasing throughout — every sentence should be freshly written for the new topic. The new script should hit the same beats in the same order, with matching pacing and persuasion techniques and tone, but a reader should not be able to find any sentence, phrase, or line that was lifted or lightly edited from the original.

HARD RULE: Do not reuse phrases, sentence stems, or word-for-word lines from the original script, even partially. If you notice yourself echoing the original's exact wording, rewrite that line from scratch using different words while keeping the same beat/technique. This is a structural clone, not a word-swap — swapping out a topic word here and there is a failure.

Output ONLY the new script. No preamble, no explanation, no headers like "Here's your script", no analysis notes, no markdown formatting. Just the copy-ready script text, formatted the way a script would be written (line breaks between beats).`;

const DEFAULT_TEXT_MODELS = [
    'grok-4-latest',
    'grok-4.5',
    'grok-3-latest',
    'grok-2-latest',
    'grok-3-mini-fast',
];

export function hasScriptCloneKey() {
    return Boolean(process.env.XAI_API_KEY);
}

/**
 * @param {{ originalScript: string, newIdea: string, brandContext?: string }} input
 */
export async function cloneScriptFormula({ originalScript, newIdea, brandContext }) {
    if (!process.env.XAI_API_KEY) {
        const err = new Error(
            'XAI_API_KEY is not set. Add your xAI/Grok key to .env and restart the server.'
        );
        err.status = 503;
        err.code = 'NO_XAI_KEY';
        throw err;
    }

    const original = String(originalScript || '').trim();
    const idea = String(newIdea || '').trim();
    if (!original || !idea) {
        const err = new Error('Both originalScript and newIdea are required');
        err.status = 400;
        throw err;
    }

    let userMessage = `ORIGINAL SCRIPT:\n"""\n${original}\n"""\n\nNEW VIDEO IDEA:\n"""\n${idea}\n"""`;
    if (brandContext && String(brandContext).trim()) {
        userMessage += `\n\nBRAND / GUARDRAILS (honor these; do not violate do-not-say):\n"""\n${String(brandContext).trim()}\n"""`;
    }

    const preferred = process.env.GROK_TEXT_MODEL || process.env.GROK_SCRIPT_MODEL;
    const models = [...new Set([preferred, ...DEFAULT_TEXT_MODELS].filter(Boolean))];

    let lastErr;
    for (const model of models) {
        try {
            const res = await fetch('https://api.x.ai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${process.env.XAI_API_KEY}`,
                },
                body: JSON.stringify({
                    model,
                    max_tokens: 1400,
                    temperature: 0.55,
                    messages: [
                        { role: 'system', content: SYSTEM_PROMPT },
                        { role: 'user', content: userMessage },
                    ],
                }),
            });

            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                const rawErr = data.error?.message || data.error || data.message;
                const msg =
                    typeof rawErr === 'string'
                        ? rawErr
                        : rawErr
                            ? JSON.stringify(rawErr)
                            : `Grok failed (${res.status})`;
                lastErr = new Error(String(msg));
                lastErr.status = res.status;
                lastErr.details = data;
                lastErr.model = model;
                console.warn(`[scripts/clone] model ${model} failed:`, msg);
                continue;
            }

            let text = data.choices?.[0]?.message?.content;
            if (Array.isArray(text)) {
                text = text.map((p) => (typeof p === 'string' ? p : p?.text || '')).join('\n');
            }
            if (!text || !String(text).trim()) {
                lastErr = new Error(`Grok (${model}) returned empty script`);
                continue;
            }

            return {
                script: String(text).trim(),
                provider: 'grok',
                model,
            };
        } catch (e) {
            lastErr = e;
            lastErr.model = model;
        }
    }

    const err = lastErr || new Error(`Grok script clone failed (tried: ${models.join(', ')})`);
    if (!err.status) err.status = 502;
    err.code = 'GROK_SCRIPT_FAILED';
    throw err;
}
