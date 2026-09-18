import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface JournalMetric {
  jif: number | null;
  jcr: 'Q1' | 'Q2' | 'Q3' | 'Q4' | '—';
  year: number | null;
}

type MetricMap = Record<string, JournalMetric>;

function loadMetrics(): MetricMap {
  const raw = process.env.JOURNAL_METRICS_JSON?.trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw) as MetricMap;
  } catch (error) {
    console.warn('[JournalMetrics] JOURNAL_METRICS_JSON is not valid JSON:', error);
    return {};
  }
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { journals?: unknown };
  const journals = Array.isArray(body.journals)
    ? [...new Set(body.journals.map((item) => String(item ?? '').trim()).filter(Boolean))].slice(0, 20)
    : [];
  const metrics = loadMetrics();

  const items = journals.flatMap((journal) => {
    const metric = metrics[journal] || metrics[journal.toLowerCase()];
    return metric
      ? [{ journal, jif: metric.jif, jcr: metric.jcr || '—', year: metric.year, confidence: 'high' as const }]
      : [];
  });

  return NextResponse.json({ items });
}
