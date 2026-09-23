import { NextRequest, NextResponse } from 'next/server';
import { invokeModel } from '@/lib/ai-provider';
import { RESEARCH_INTENT_PROMPT } from '@/lib/research-intent-prompt';
import { buildFallbackMedicalQuery } from '@/lib/search-query';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Action = 'search' | 'hotspots' | 'paper_discussion' | 'topic' | 'retopic' | 'review' | 'clarify' | 'files' | 'chat';

interface IntentResult {
  action: Action;
  searchQuery?: string;
  searchSummary?: string;
  clarification?: string;
  reason?: string;
}

function fastIntent(message: string): IntentResult | null {
  const text = message.trim();
  if (/hotspot|research\s+trend|research\s+frontier|trend\s+analysis/i.test(text)) return { action: 'hotspots', reason: 'Explicit hotspot-analysis intent.' };
  if (/search|look\s+up|find\s+(papers|articles|literature)|PubMed|Web\s*of\s*Science|\bWOS\b|impact\s+factor|\bJIF\b|\bJCR\b|\bQ[1-4]\b|clinical\s+evidence|research\s+progress/i.test(text)) {
    const keyword = buildFallbackMedicalQuery(text);
    return {
      action: 'search',
      searchQuery: keyword.query,
      searchSummary: keyword.summary,
      reason: 'Explicit literature-search intent.',
    };
  }
  if (/(these|selected|confirmed)\s+(papers|articles)/i.test(text) && /compare|difference|limitation|design|endpoint|conclusion/i.test(text)) return { action: 'paper_discussion', reason: 'Discussion of selected papers.' };
  if (/recommend\s+again|re-?match|different\s+(topic|direction)|change\s+the\s+(population|endpoint|outcome)/i.test(text)) return { action: 'retopic', reason: 'Request to rebuild candidate topics.' };
  if (/research\s+(topic|question|direction)|narrow\s+(the\s+)?topic|candidate\s+topic/i.test(text)) return { action: 'topic', reason: 'Topic-development intent.' };
  if (/review\s+(outline|draft|structure|format|guidance)|evaluate\s+(my\s+)?review|systematic\s+review/i.test(text)) return { action: 'review', reason: 'Review-guidance intent.' };
  if (/upload|attachment|this\s+file|PDF|Word|Excel|spreadsheet|image/i.test(text)) return { action: 'files', reason: 'Uploaded-material discussion intent.' };
  return text.replace(/\s/g, '').length >= 18 ? { action: 'chat', reason: 'Complete natural-language request.' } : null;
}

function fallbackIntent(message: string): IntentResult {
  const compact = message.replace(/[,.!?;:\s]/g, '');
  if (compact.length <= 12 && !/why|how|compare|explain|whether|can\s/i.test(message)) {
    return {
      action: 'clarify',
      clarification: 'Would you like to search the literature on this topic first, or discuss the research question first?',
      reason: 'The requested action is unclear.',
    };
  }
  return { action: 'chat', reason: 'General research discussion.' };
}

function parseJson(raw: string): IntentResult | null {
  try {
    const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? raw) as IntentResult;
    return parsed?.action ? parsed : null;
  } catch {
    return null;
  }
}

function buildPubMedQuery(message: string) {
  return buildFallbackMedicalQuery(message);
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const message = String(body.message ?? '').trim();
  const history = Array.isArray(body.history) ? body.history.slice(-10) : [];
  if (!message) return NextResponse.json({ error: 'Missing message' }, { status: 400 });

  const historyText = history.map((item: { role?: string; content?: string }) => `${item.role ?? 'unknown'}: ${String(item.content ?? '')}`).join('\n');
  const fastDecision = fastIntent(message);
  let decision = fastDecision;
  if (!decision) {
    try {
      const raw = await invokeModel([
        { role: 'system', content: RESEARCH_INTENT_PROMPT },
        { role: 'user', content: `Recent conversation:\n${historyText || '(none)'}\n\nLatest input:\n${message}\n\nChoose the next action.` },
      ], { temperature: 0.1 });
      decision = parseJson(raw);
    } catch (error) {
      console.warn('[Intent] Classification failed; using local rules:', error);
    }
  }

  decision ??= fallbackIntent(message);
  if (decision.action === 'search') {
    const built = buildPubMedQuery(message);
    decision.searchQuery = built.query;
    decision.searchSummary = built.summary;
  }
  return NextResponse.json(decision);
}
