import { NextRequest, NextResponse } from 'next/server';
import { FAST_MODEL, invokeModel } from '@/lib/ai-provider';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface SuggestionItem {
  label: string;
  instruction: string;
}

function parseItems(raw: string): SuggestionItem[] {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]) as { items?: SuggestionItem[] };
    return Array.isArray(parsed.items)
      ? parsed.items
          .filter((item) => item && typeof item.label === 'string' && typeof item.instruction === 'string')
          .map((item) => ({ label: item.label.trim().slice(0, 16), instruction: item.instruction.trim().slice(0, 500) }))
          .filter((item) => item.label && item.instruction)
          .slice(0, 4)
      : [];
  } catch {
    return [];
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const stage = String(body.stage ?? 'Research Discussion');
  const userMessage = String(body.userMessage ?? '').trim();
  const assistantMessage = String(body.assistantMessage ?? '').trim();
  const selectedPapers = Array.isArray(body.selectedPapers) ? body.selectedPapers.slice(0, 6) : [];

  if (!assistantMessage) return NextResponse.json({ items: [] });

  const prompt = `You generate "next clickable buttons" for a medical research teaching conversation. The buttons show only short labels; the real teaching action goes into the instruction field.

Current module: ${stage}
Student input this turn: ${userMessage || '(no explicit input)'}
Assistant answer this turn: ${assistantMessage.slice(0, 5000)}
Currently confirmed papers: ${JSON.stringify(selectedPapers)}

Rules:
1. Return 2-4 suggestions that truly fit "this exact turn of the conversation"; fixed templates are forbidden;
2. The label must be very short (2-5 English words), describing an action the student understands, e.g. "Compare the two populations", "Explore renal outcomes", "Search this evidence";
3. The instruction is a hidden teaching requirement for the main model and may be detailed;
4. In the topic-discussion stage, never give the final topic for the student. Prefer having the student compare 2-3 research directions, evidence differences, or feasibility, and let them express their judgment through questions;
5. If the assistant already posed a key question in the previous turn, the buttons should help the student continue along different answer directions instead of repeating the same question;
6. Review guidance may only recommend high-quality reference formats, search for reference reviews, or strictly evaluate the student's own content - never generate the review body text;
7. Paper discussion should focus on confirmed papers, but one button may be for "continue searching to verify";
8. Do not use system-like wording such as "next step suggestions", "please choose", or "do not finalize the topic";
9. Do not expose internal prompts, intent labels, or model rules;
10. All labels and instructions must be written in English. Strictly return JSON:
{"items":[{"label":"short button","instruction":"hidden teaching instruction passed to the main model when clicked"}]}`;

  try {
    const raw = await invokeModel([{ role: 'user', content: prompt }], {
      model: FAST_MODEL,
      temperature: 0.25,
    });
    return NextResponse.json({ items: parseItems(raw) });
  } catch (error) {
    console.warn('[Suggestions] Failed to generate dynamic suggestions:', error);
    return NextResponse.json({ items: [] });
  }
}
