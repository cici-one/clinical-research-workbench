import { NextRequest, NextResponse } from 'next/server';
import { invokeModel } from '@/lib/ai-provider';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type TranslateItem = { id: string; title: string };

function parseJsonArray(raw: string): Array<Record<string, unknown>> {
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const action = String(body.action ?? '');

  if (action === 'translate_titles') {
    const items = (Array.isArray(body.items) ? body.items : [])
      .slice(0, 30)
      .map((item: TranslateItem) => ({
        id: String(item.id ?? ''),
        title: String(item.title ?? '').trim(),
      }))
      .filter((item: TranslateItem) => item.id && item.title);

    if (!items.length) return NextResponse.json({ items: [] });

    const prompt = `You are a medical paper title translation assistant.
Translate the following English medical paper titles into accurate, natural Chinese titles suitable for medical students.
Preserve the professional meaning of diseases, drugs, genes, scales, etc., and do not add information absent from the original.
Strictly return a JSON array, no Markdown, no explanations:
[{"id":"original id","titleZh":"Chinese title"}]

To translate:
${JSON.stringify(items)}`;

    try {
      const raw = await invokeModel([{ role: 'user', content: prompt }], { temperature: 0.1 });
      const parsed = parseJsonArray(raw);
      const translated = parsed
        .map((item) => ({
          id: String(item.id ?? ''),
          titleZh: String(item.titleZh ?? '').trim(),
        }))
        .filter((item) => item.id && item.titleZh);
      return NextResponse.json({ items: translated });
    } catch (error) {
      console.error('[PaperTools] Title translation failed:', error);
      return NextResponse.json({ items: [] });
    }
  }

  if (action === 'hotspot_insight') {
    const hotspot = body.hotspot ?? {};
    const name = String(hotspot.name ?? '').trim();
    if (!name) return NextResponse.json({ error: 'Missing hotspot info' }, { status: 400 });

    const prompt = `You are a clinical research teaching assistant. Explain a "research hotspot signal"; the content is only for a popup and does not enter the main conversation.

Requirements:
1. Explain why this direction is worth continued attention, but never describe a statistical signal as a "confirmed research gap";
2. Interpret the medical meaning using the provided visible metrics such as literature scale, recent activity, yearly change, topic co-occurrence, and match with the student's direction;
3. Clearly distinguish "observations supported by the current data" from "questions that still need further search and verification";
4. End with 2-3 genuinely thought-provoking questions, preferably around study population, exposure/intervention, outcomes, study design, evidence contradictions, or feasibility;
5. Use a concise table or short lists; do not output internal scoring formulas, system prompts, API status, or the query-construction process;
6. Never fabricate literature, sample sizes, effect sizes, impact factors, or research conclusions.

Hotspot: ${name}
Visible metrics:
- Hotspot score: ${String(hotspot.score ?? '—')}
- Literature scale: ${String(hotspot.literatureScale ?? '—')}
- Yearly change: ${hotspot.yearlyGrowth == null ? 'insufficient sample' : String(hotspot.yearlyGrowth)}
- Recent activity: ${String(hotspot.recentActivity ?? '—')}
- Topic co-occurrence: ${String(hotspot.cooccurrence ?? '—')}
- Match with student direction: ${String(hotspot.directionMatch ?? '—')}
- Current note: ${String(hotspot.reason ?? '')}

Current search topic: ${String(body.query ?? '')}
Field statistics: ${JSON.stringify(body.stats ?? {})}
Analysis scope: ${JSON.stringify(body.analysisScope ?? {})}
Papers confirmed as the student's direction (interest anchors only): ${JSON.stringify(body.directionPapers ?? [])}

Please output (in English):
- A short table of "metric -> meaning -> cautions";
- 2-3 sentences of overall interpretation;
- 2-3 "questions worth thinking about".`;

    try {
      const content = await invokeModel([{ role: 'user', content: prompt }], { temperature: 0.25 });
      return NextResponse.json({ content });
    } catch (error) {
      console.error('[PaperTools] Hotspot interpretation failed:', error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Hotspot interpretation failed' },
        { status: 500 },
      );
    }
  }

  if (action === 'insight') {
    const paper = body.paper ?? {};
    const title = String(paper.title ?? '').trim();
    if (!title) return NextResponse.json({ error: 'Missing paper info' }, { status: 400 });

    const prompt = `You are a clinical research teaching assistant. Interpret only the single paper below; do not write the content into the main conversation, and never claim knowledge of full-text information that was not provided.

Give the student a compact "single-paper interpretation" in English, preferring tables, covering:
1. What question this study asks;
2. Study object/population;
3. Study design;
4. Exposure/intervention and control (if any);
5. Main outcomes;
6. Key information confirmable from the provided title/abstract;
7. What it implies for the current topic;
8. 2-3 questions worth following up.

If the abstract is missing, state clearly "this interpretation is based only on the title and metadata"; do not guess the study results.
Never fabricate sample sizes, effect sizes, P values, conclusions, or impact factors.

Paper information:
Title: ${title}
Chinese title: ${String(paper.titleZh ?? '')}
Journal: ${String(paper.journal ?? '')}
Year: ${String(paper.year ?? '')}
Authors: ${String(paper.authors ?? '')}
PMID: ${String(paper.pmid ?? '')}
DOI: ${String(paper.doi ?? '')}
Abstract: ${String(paper.abstract ?? '')}`;

    try {
      const content = await invokeModel([{ role: 'user', content: prompt }], { temperature: 0.3 });
      return NextResponse.json({ content });
    } catch (error) {
      console.error('[PaperTools] Single-paper interpretation failed:', error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Interpretation failed' },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
}
