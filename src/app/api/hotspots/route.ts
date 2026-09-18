import { NextRequest, NextResponse } from 'next/server';
import { invokeModel } from '@/lib/ai-provider';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PUBMED_SEARCH_URL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi';
const PUBMED_SUMMARY_URL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi';

interface PaperLite {
  title?: string;
  abstract?: string;
  year?: number;
  pmid?: string;
  journal?: string;
}

interface HotspotItem {
  name: string;
  score: number;
  reason: string;
  keywords?: string[];
  literatureScale?: number;
  yearlyGrowth?: number | null;
  recentActivity?: number;
  cooccurrence?: number;
  supportPmids?: string[];
  confidence?: 'low' | 'medium' | 'high';
  evidenceCoverage?: number;
  directionMatch?: number;
}

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'in', 'on', 'for', 'to', 'with', 'by', 'is', 'are', 'was',
  'were', 'be', 'been', 'being', 'have', 'has', 'had', 'this', 'that', 'these', 'those', 'from',
  'study', 'studies', 'patients', 'patient', 'clinical', 'research', 'using', 'based', 'among',
  'associated', 'risk', 'analysis', 'results', 'methods', 'conclusion', 'background',
]);

function addNcbiParams(url: URL) {
  url.searchParams.set('tool', process.env.NCBI_TOOL || 'clinical-research-agent');
  if (process.env.NCBI_EMAIL) url.searchParams.set('email', process.env.NCBI_EMAIL);
  if (process.env.NCBI_API_KEY) url.searchParams.set('api_key', process.env.NCBI_API_KEY);
}

async function fetchJsonWithTimeout(url: URL, timeoutMs = 12000): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { cache: 'no-store', signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function extractYear(value?: string): number {
  const match = String(value ?? '').match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : 0;
}

async function fetchPubMedFieldSample(query: string, max = 300): Promise<{
  papers: PaperLite[];
  totalCount: number;
}> {
  if (!query.trim()) return { papers: [], totalCount: 0 };

  const searchUrl = new URL(PUBMED_SEARCH_URL);
  searchUrl.searchParams.set('db', 'pubmed');
  searchUrl.searchParams.set('term', query);
  searchUrl.searchParams.set('retmode', 'json');
  searchUrl.searchParams.set('retmax', String(Math.min(Math.max(max, 50), 500)));
  searchUrl.searchParams.set('sort', 'pub date');
  addNcbiParams(searchUrl);

  const searchPayload = await fetchJsonWithTimeout(searchUrl) as {
    esearchresult?: { idlist?: string[]; count?: string };
  };
  const ids = searchPayload.esearchresult?.idlist ?? [];
  const totalCount = Number(searchPayload.esearchresult?.count ?? 0);
  if (!ids.length) return { papers: [], totalCount };

  const summaryUrl = new URL(PUBMED_SUMMARY_URL);
  summaryUrl.searchParams.set('db', 'pubmed');
  summaryUrl.searchParams.set('id', ids.join(','));
  summaryUrl.searchParams.set('retmode', 'json');
  addNcbiParams(summaryUrl);

  const summaryPayload = await fetchJsonWithTimeout(summaryUrl, 15000) as {
    result?: Record<string, unknown>;
  };

  const papers: PaperLite[] = [];
  for (const id of ids) {
    const row = summaryPayload.result?.[id] as {
      title?: string;
      fulljournalname?: string;
      pubdate?: string;
      sortpubdate?: string;
    } | undefined;
    if (!row?.title) continue;
    papers.push({
      title: row.title,
      journal: row.fulljournalname,
      year: extractYear(row.pubdate ?? row.sortpubdate),
      pmid: id,
    });
  }
  return { papers, totalCount };
}

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractKeywords(texts: string[], topN = 16): string[] {
  const freq = new Map<string, number>();
  for (const text of texts) {
    const enWords = text.toLowerCase().match(/[a-z][a-z0-9-]{3,}/g) ?? [];
    for (const word of enWords) {
      if (!STOP_WORDS.has(word)) freq.set(word, (freq.get(word) ?? 0) + 1);
    }
    const cnTerms = text.match(/[\u4e00-\u9fa5]{2,5}/g) ?? [];
    for (const term of cnTerms) {
      if (!STOP_WORDS.has(term)) freq.set(term, (freq.get(term) ?? 0) + 1);
    }
  }
  return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, topN).map(([term]) => term);
}

function yearDistribution(papers: PaperLite[]): Array<{ year: number; count: number }> {
  const map = new Map<number, number>();
  for (const paper of papers) {
    const year = Number(paper.year);
    if (!Number.isFinite(year) || year < 1900) continue;
    map.set(year, (map.get(year) ?? 0) + 1);
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([year, count]) => ({ year, count }));
}

function mergeCorpus(primary: PaperLite[], extra: PaperLite[]): PaperLite[] {
  const map = new Map<string, PaperLite>();
  for (const paper of [...primary, ...extra]) {
    const key = paper.pmid
      ? `pmid:${paper.pmid}`
      : `title:${normalizeText(String(paper.title ?? ''))}|${paper.year ?? ''}`;
    const existing = map.get(key);
    if (!existing) map.set(key, paper);
    else map.set(key, {
      ...existing,
      ...paper,
      abstract: (paper.abstract?.length ?? 0) > (existing.abstract?.length ?? 0) ? paper.abstract : existing.abstract,
    });
  }
  return [...map.values()];
}

function metricRows(
  hotspots: HotspotItem[],
  corpus: PaperLite[],
  directionPapers: PaperLite[],
): HotspotItem[] {
  const currentYear = new Date().getFullYear();
  const normalizedCorpus = corpus.map((paper) => ({
    ...paper,
    text: normalizeText(`${paper.title ?? ''} ${paper.abstract ?? ''}`),
  }));
  const normalizedDirection = directionPapers.map((paper) => ({
    ...paper,
    text: normalizeText(`${paper.title ?? ''} ${paper.abstract ?? ''}`),
  }));

  const preliminary = hotspots.map((hotspot) => {
    const terms = (hotspot.keywords?.length ? hotspot.keywords : [hotspot.name])
      .map((item) => normalizeText(item))
      .filter((item) => item.length >= 2);

    const matched = normalizedCorpus.filter((paper) => terms.some((term) => paper.text.includes(term)));
    const effective = matched.length ? matched : normalizedCorpus.slice(0, Math.min(5, normalizedCorpus.length));
    const literatureScale = matched.length;

    const recentCount = effective.filter((paper) => Number(paper.year) >= currentYear - 2).length;
    const recentActivity = effective.length ? Math.round((recentCount / effective.length) * 100) : 0;

    const latestWindow = effective.filter((paper) => Number(paper.year) >= currentYear - 1).length;
    const previousWindow = effective.filter(
      (paper) => Number(paper.year) >= currentYear - 3 && Number(paper.year) <= currentYear - 2,
    ).length;
    let yearlyGrowth: number | null = null;
    if (effective.length >= 8) {
      if (previousWindow > 0) yearlyGrowth = Math.round(((latestWindow - previousWindow) / previousWindow) * 100);
      else if (latestWindow > 0) yearlyGrowth = 100;
      else yearlyGrowth = 0;
      yearlyGrowth = Math.max(-100, Math.min(200, yearlyGrowth));
    }

    const cooccurrenceCount = effective.filter((paper) => {
      const hits = terms.filter((term) => paper.text.includes(term)).length;
      return terms.length >= 2 ? hits >= 2 : hits >= 1;
    }).length;
    const cooccurrence = effective.length ? Math.round((cooccurrenceCount / effective.length) * 100) : 0;

    const directionHits = normalizedDirection.filter((paper) => terms.some((term) => paper.text.includes(term))).length;
    const directionMatch = normalizedDirection.length
      ? Math.round((directionHits / normalizedDirection.length) * 100)
      : 0;

    return {
      ...hotspot,
      literatureScale,
      evidenceCoverage: corpus.length ? Math.round((literatureScale / corpus.length) * 100) : 0,
      yearlyGrowth,
      recentActivity,
      cooccurrence,
      directionMatch,
      supportPmids: effective.map((paper) => paper.pmid).filter(Boolean).slice(0, 5) as string[],
    };
  });

  const maxScale = Math.max(1, ...preliminary.map((row) => row.literatureScale ?? 0));
  return preliminary.map((row) => {
    const scaleScore = ((row.literatureScale ?? 0) / maxScale) * 100;
    const growthScore = row.yearlyGrowth == null
      ? 50
      : Math.max(0, Math.min(100, ((row.yearlyGrowth + 100) / 300) * 100));

    const score = Math.round(
      scaleScore * 0.25 +
      (row.recentActivity ?? 0) * 0.25 +
      growthScore * 0.20 +
      (row.cooccurrence ?? 0) * 0.20 +
      (row.directionMatch ?? 0) * 0.10,
    );

    const confidence: 'low' | 'medium' | 'high' =
      corpus.length >= 100 ? 'high' : corpus.length >= 30 ? 'medium' : 'low';

    return { ...row, score: Math.max(0, Math.min(100, score)), confidence };
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const currentResults = (Array.isArray(body.papers) ? body.papers : []) as PaperLite[];
  const directionPapers = (Array.isArray(body.directionPapers) ? body.directionPapers : []) as PaperLite[];
  const query = String(body.query ?? '').trim();
  const displayQuery = String(body.displayQuery ?? '').trim();

  if (!currentResults.length && !query) {
    return NextResponse.json({ error: 'Please search literature before running hotspot analysis' }, { status: 400 });
  }

  try {
    let pubmedSample: PaperLite[] = [];
    let pubmedTotal = 0;
    if (query) {
      try {
        const sample = await fetchPubMedFieldSample(query, 300);
        pubmedSample = sample.papers;
        pubmedTotal = sample.totalCount;
      } catch (error) {
        console.warn('[Hotspots] Failed to expand PubMed sample, using currently loaded results:', error);
      }
    }

    const corpus = mergeCorpus(currentResults, pubmedSample);
    const dist = yearDistribution(corpus);
    const keywords = extractKeywords(
      corpus.map((paper) => `${paper.title ?? ''} ${paper.abstract ?? ''}`),
      18,
    );

    const directionSummary = directionPapers.slice(0, 12).map((paper) => ({
      title: paper.title,
      year: paper.year,
      journal: paper.journal,
      pmid: paper.pmid,
    }));
    const broadSummary = corpus.slice(0, 40).map((paper) => ({
      title: paper.title,
      year: paper.year,
      journal: paper.journal,
      pmid: paper.pmid,
    }));

    const prompt = `You are a clinical research topic-selection mentor. Help the student discover directions worth further research from a broad set of literature search results.

This is not an analysis of only the few papers the student checked:
- The "field sample" is used to judge overall active research directions;
- The "papers confirmed by the student" serve only as anchors of the student's current interest, used to prioritize related or adjacent research topics;
- Do not treat the few selected papers themselves as hotspots of the whole field just because the student selected only a few.

Identify 3-5 research directions. Each direction should jointly consider:
1. Its scale and recent activity level within the field sample;
2. The combination of study object/population, exposure or intervention, outcome, and study design;
3. Its relevance to the papers confirmed by the student;
4. Whether it can further guide the student to raise new research questions.

Do not claim "a research gap has been proven". Use wording such as "worth further search and verification" or "potential research opportunity".
Numeric scores are computed by the program; never invent numbers yourself.

All names, keywords and reasons must be written in English. Strictly return a JSON array:
[
  {"name":"English direction name, at most 6 words","score":0,"keywords":["English topic terms"],"reason":"One sentence on why it deserves continued attention"}
]

Search topic: ${displayQuery || query}
Field sample size: ${corpus.length}
Total PubMed hits (if available): ${pubmedTotal}
Field keywords: ${JSON.stringify(keywords)}
Papers confirmed by the student: ${JSON.stringify(directionSummary)}
Field sample literature: ${JSON.stringify(broadSummary)}`;

    let hotspots: HotspotItem[] = [];
    // Truncate over-long samples to reduce the chance of hitting model input limits/content moderation (400) and truncated JSON output
    const compactPrompt = prompt.length > 20000 ? `${prompt.slice(0, 20000)}\n]` : prompt;

    for (const temperature of [0.35, 0.1]) {
      try {
        const raw = await invokeModel([{ role: 'user', content: compactPrompt }], { temperature });
        const match = raw.match(/\[[\s\S]*\]/);
        if (!match) continue;
        const parsed = JSON.parse(match[0]);
        if (Array.isArray(parsed) && parsed.length) {
          hotspots = parsed as HotspotItem[];
          break;
        }
      } catch (error) {
        console.warn('[Hotspots] Model hotspot naming failed; will retry or fall back to keywords:', error);
      }
    }

    if (!hotspots.length) {
      hotspots = keywords.slice(0, 4).map((keyword) => ({
        name: keyword,
        score: 0,
        keywords: [keyword],
        reason: 'This topic recurs within the current search scope and can serve as an entry point for further searching and topic discussion.',
      }));
    }

    const enriched = metricRows(hotspots, corpus, directionPapers);

    return NextResponse.json({
      hotspots: enriched,
      stats: {
        total: corpus.length,
        searchTotal: pubmedTotal || currentResults.length,
        selectedDirectionCount: directionPapers.length,
        yearDistribution: dist,
        topKeywords: keywords,
      },
      analysisScope: {
        fieldSample: corpus.length,
        selectedDirection: directionPapers.length,
        pubmedTotal,
      },
    });
  } catch (error) {
    console.error('[Hotspots] Analysis failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Hotspot analysis failed' },
      { status: 500 },
    );
  }
}
