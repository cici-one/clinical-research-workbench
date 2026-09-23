import { NextRequest, NextResponse } from 'next/server';
import { buildFallbackMedicalQuery } from '@/lib/search-query';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PUBMED_SEARCH_URL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi';
const PUBMED_SUMMARY_URL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi';
const PUBMED_FETCH_URL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi';
const DEFAULT_WOS_STARTER_URL = 'https://api.clarivate.com/apis/wos-starter/v1/documents';

type SearchSource = 'pubmed' | 'wos';

interface PaperResult {
  id: string;
  title: string;
  journal: string;
  year: number;
  jif: number | null;
  jcr: 'Q1' | 'Q2' | 'Q3' | 'Q4' | '—';
  type: string;
  abstract: string;
  source: 'PubMed' | 'Web of Science';
  pmid: string;
  doi?: string;
  wosId?: string;
  url?: string;
  authors?: string;
  citation_count?: number;
}

interface PubMedSummary {
  uid: string;
  title: string;
  fulljournalname?: string;
  pubdate?: string;
  authors?: Array<{ name: string }>;
  articleids?: Array<{ idtype: string; value: string }>;
  sortpubdate?: string;
  pubtype?: string[];
}

function extractYear(value?: string): number {
  if (!value) return new Date().getFullYear();
  const m = value.match(/\b(19|20)\d{2}\b/);
  return m ? Number(m[0]) : new Date().getFullYear();
}

function extractDoi(ids?: Array<{ idtype: string; value: string }>): string | undefined {
  return ids?.find((x) => x.idtype?.toLowerCase() === 'doi')?.value;
}


function getYearRangeBounds(yearRange?: string): { mindate?: string; maxdate?: string; startYear?: number; endYear?: number } {
  if (!yearRange || yearRange === 'any') return {};
  const years = yearRange === '1y' ? 1 : yearRange === '3y' ? 3 : yearRange === '5y' ? 5 : 0;
  if (!years) return {};
  const now = new Date();
  const start = new Date(now);
  start.setFullYear(now.getFullYear() - years);
  const fmt = (date: Date) => `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
  return {
    mindate: fmt(start),
    maxdate: fmt(now),
    startYear: start.getFullYear(),
    endYear: now.getFullYear(),
  };
}

function addNcbiParams(url: URL) {
  url.searchParams.set('tool', process.env.NCBI_TOOL || 'clinical-research-agent');
  if (process.env.NCBI_EMAIL) url.searchParams.set('email', process.env.NCBI_EMAIL);
  if (process.env.NCBI_API_KEY) url.searchParams.set('api_key', process.env.NCBI_API_KEY);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(
  url: URL,
  label: string,
  options?: {
    attempts?: number;
    timeoutMs?: number;
    headers?: HeadersInit;
  },
): Promise<Response> {
  const attempts = options?.attempts ?? 3;
  const timeoutMs = options?.timeoutMs ?? 12000;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        cache: 'no-store',
        signal: controller.signal,
        headers: {
          Accept: 'application/json,text/plain,*/*',
          'User-Agent': `${process.env.NCBI_TOOL || 'clinical-research-agent'}/1.0`,
          ...(options?.headers ?? {}),
        },
      });
      clearTimeout(timer);

      if (response.ok) return response;

      lastError = new Error(`${label} HTTP ${response.status}`);
      if (response.status < 500 && response.status !== 429) throw lastError;
    } catch (error) {
      clearTimeout(timer);
      lastError = error;
      if (attempt >= attempts) break;
    }

    await sleep(350 * attempt);
  }

  const detail = lastError instanceof Error ? lastError.message : String(lastError ?? 'unknown');
  throw new Error(`${label} request failed or timed out: ${detail}`);
}

async function normalizeQueryForPubMed(raw: string): Promise<string> {
  return buildFallbackMedicalQuery(raw).query;
}

async function normalizeQueryForWos(raw: string): Promise<string> {
  const cleaned = raw
    .replace(/please|search|look\s+up|find|papers?|articles?|literature|show\s+me/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned;
}

async function searchPubMed(
  query: string,
  retstart = 0,
  retmax = 100,
  yearRange = 'any',
): Promise<{ papers: PaperResult[]; totalCount: number }> {
  const safeMax = Math.max(1, Math.min(retmax, 200));

  const searchUrl = new URL(PUBMED_SEARCH_URL);
  searchUrl.searchParams.set('db', 'pubmed');
  searchUrl.searchParams.set('term', query);
  searchUrl.searchParams.set('retmode', 'json');
  searchUrl.searchParams.set('retstart', String(Math.max(0, retstart)));
  searchUrl.searchParams.set('retmax', String(safeMax));
  searchUrl.searchParams.set('sort', 'relevance');
  const dateBounds = getYearRangeBounds(yearRange);
  if (dateBounds.mindate && dateBounds.maxdate) {
    searchUrl.searchParams.set('datetype', 'pdat');
    searchUrl.searchParams.set('mindate', dateBounds.mindate);
    searchUrl.searchParams.set('maxdate', dateBounds.maxdate);
  }
  addNcbiParams(searchUrl);

  const searchRes = await fetchWithRetry(searchUrl, 'PubMed ESearch');
  const searchData = (await searchRes.json()) as {
    esearchresult?: { idlist?: string[]; count?: string };
  };

  const ids = searchData.esearchresult?.idlist ?? [];
  const totalCount = Number(searchData.esearchresult?.count ?? 0);
  if (!ids.length) return { papers: [], totalCount };

  const summaryUrl = new URL(PUBMED_SUMMARY_URL);
  summaryUrl.searchParams.set('db', 'pubmed');
  summaryUrl.searchParams.set('id', ids.join(','));
  summaryUrl.searchParams.set('retmode', 'json');
  addNcbiParams(summaryUrl);

  const summaryRes = await fetchWithRetry(summaryUrl, 'PubMed ESummary');
  const summaryData = (await summaryRes.json()) as {
    result?: { [key: string]: unknown };
  };

  const abstractUrl = new URL(PUBMED_FETCH_URL);
  abstractUrl.searchParams.set('db', 'pubmed');
  abstractUrl.searchParams.set('id', ids.join(','));
  abstractUrl.searchParams.set('rettype', 'abstract');
  abstractUrl.searchParams.set('retmode', 'text');
  addNcbiParams(abstractUrl);

  let abstractText = '';
  try {
    const abstractRes = await fetchWithRetry(abstractUrl, 'PubMed EFetch', {
      attempts: 2,
      timeoutMs: 15000,
    });
    abstractText = await abstractRes.text();
  } catch (error) {
    console.warn('[Search] PubMed abstract lookup failed; returning metadata only:', error);
  }

  const abstractMap = new Map<string, string>();
  if (abstractText) {
    const chunks = abstractText.split(/\n(?=\d+\.\s)/);
    for (const chunk of chunks) {
      const pmidMatch = chunk.match(/PMID:\s*(\d+)/);
      if (!pmidMatch) continue;
      const abstractMatch = chunk.match(/Abstract\s*([\s\S]*?)(?:\n[A-Z][A-Za-z ]+:|\nPMID:|$)/i);
      if (abstractMatch?.[1]) {
        abstractMap.set(
          pmidMatch[1],
          abstractMatch[1].replace(/\s+/g, ' ').trim().slice(0, 1800),
        );
      }
    }
  }

  const papers: PaperResult[] = [];
  for (const id of ids) {
    const item = summaryData.result?.[id] as PubMedSummary | undefined;
    if (!item?.title) continue;

    const doi = extractDoi(item.articleids);
    const authors = item.authors?.slice(0, 5).map((a) => a.name).join(', ');

    papers.push({
      id: `pmid_${id}`,
      title: item.title.replace(/\.$/, ''),
      journal: item.fulljournalname ?? 'Unknown Journal',
      year: extractYear(item.pubdate ?? item.sortpubdate),
      jif: null,
      jcr: '—',
      type: item.pubtype?.[0] ?? 'Journal Article',
      abstract: abstractMap.get(id) || '',
      source: 'PubMed',
      pmid: id,
      ...(doi ? { doi } : {}),
      url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
      ...(authors ? { authors } : {}),
    });
  }

  return { papers, totalCount };
}

function deepFindText(value: unknown, keys: string[]): string {
  const wanted = new Set(keys.map((x) => x.toLowerCase()));
  const stack: unknown[] = [value];

  while (stack.length) {
    const current = stack.pop();
    if (!current || typeof current !== 'object') continue;

    if (Array.isArray(current)) {
      for (const item of current) stack.push(item);
      continue;
    }

    for (const [key, raw] of Object.entries(current as Record<string, unknown>)) {
      if (wanted.has(key.toLowerCase())) {
        if (typeof raw === 'string' || typeof raw === 'number') return String(raw);
        if (Array.isArray(raw) && raw.length) {
          const first = raw[0];
          if (typeof first === 'string' || typeof first === 'number') return String(first);
          if (first && typeof first === 'object') {
            const text = deepFindText(first, ['value', 'content', 'name', 'title', '#text']);
            if (text) return text;
          }
        }
      }
      if (raw && typeof raw === 'object') stack.push(raw);
    }
  }

  return '';
}

function findWosDocuments(payload: unknown): unknown[] {
  if (!payload || typeof payload !== 'object') return [];
  const obj = payload as Record<string, unknown>;

  for (const key of ['hits', 'documents', 'records', 'data']) {
    const value = obj[key];
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') {
      const nested = findWosDocuments(value);
      if (nested.length) return nested;
    }
  }

  return [];
}

function findWosTotal(payload: unknown): number {
  const raw = deepFindText(payload, ['total', 'totalHits', 'recordsFound', 'count']);
  const num = Number(raw);
  return Number.isFinite(num) ? num : 0;
}

async function searchWebOfScience(
  rawQuery: string,
  retstart = 0,
  retmax = 100,
  yearRange = 'any',
): Promise<{
  papers: PaperResult[];
  totalCount: number;
  available: boolean;
  warning?: string;
}> {
  const apiKey = process.env.WOS_API_KEY?.trim();
  if (!apiKey) {
    return {
      papers: [],
      totalCount: 0,
      available: false,
      warning: 'Web of Science is not configured. Set WOS_API_KEY to enable this source.',
    };
  }

  const normalized = await normalizeQueryForWos(rawQuery);
  const safeMax = Math.max(1, Math.min(retmax, 50));
  const page = Math.floor(Math.max(0, retstart) / safeMax) + 1;
  const base = process.env.WOS_API_BASE?.trim() || DEFAULT_WOS_STARTER_URL;
  const url = new URL(base);

  url.searchParams.set('db', 'WOS');
  let wosQuery = /^[A-Z]{2,5}\s*=/.test(normalized.trim()) ? normalized.trim() : `TS=(${normalized.trim()})`;
  const dateBounds = getYearRangeBounds(yearRange);
  if (dateBounds.startYear && dateBounds.endYear) {
    wosQuery = `${wosQuery} AND PY=(${dateBounds.startYear}-${dateBounds.endYear})`;
  }
  url.searchParams.set('q', wosQuery);
  url.searchParams.set('limit', String(safeMax));
  url.searchParams.set('page', String(page));

  const response = await fetchWithRetry(url, 'Web of Science', {
    attempts: 2,
    timeoutMs: 15000,
    headers: { 'X-ApiKey': apiKey },
  });
  const payload = await response.json();

  const documents = findWosDocuments(payload);
  const totalCount = findWosTotal(payload);

  const papers = documents.map((doc, index): PaperResult => {
    const title = deepFindText(doc, ['title', 'itemTitle', 'documentTitle']) || `Web of Science Record ${retstart + index + 1}`;
    const journal = deepFindText(doc, ['sourceTitle', 'journal', 'journalTitle', 'source']) || 'Unknown Journal';
    const year = extractYear(deepFindText(doc, ['year', 'pubYear', 'publicationYear', 'published']));
    const doi = deepFindText(doc, ['doi']);
    const wosId = deepFindText(doc, ['uid', 'ut', 'wosId', 'wosuid']);
    const authors = deepFindText(doc, ['authors', 'author']);
    const citation = Number(deepFindText(doc, ['citations', 'timesCited', 'citationCount']));
    const abstract = deepFindText(doc, ['abstract', 'abstractText']) || '';

    return {
      id: `wos_${wosId || doi || retstart + index}`,
      title,
      journal,
      year,
      jif: null,
      jcr: '—',
      type: deepFindText(doc, ['documentType', 'doctype', 'type']) || 'Journal Article',
      abstract,
      source: 'Web of Science',
      pmid: '',
      ...(doi ? { doi } : {}),
      ...(wosId ? { wosId } : {}),
      ...(authors ? { authors } : {}),
      ...(Number.isFinite(citation) ? { citation_count: citation } : {}),
    };
  });

  return { papers, totalCount, available: true };
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const originalQuery = String(body.originalQuery ?? body.query ?? '').trim();
  const query = String(body.query ?? originalQuery).trim();
  const source = String(body.source ?? 'pubmed').toLowerCase() as SearchSource;
  const retstart = Math.max(0, Number(body.retstart ?? 0) || 0);
  const retmax = Math.max(1, Math.min(Number(body.retmax ?? 100) || 100, 200));
  const yearRange = String(body.yearRange ?? 'any');

  if (!originalQuery && !query) {
    return NextResponse.json({ error: 'Missing query' }, { status: 400 });
  }

  try {
    if (source === 'wos') {
      const result = await searchWebOfScience(originalQuery || query, retstart, retmax, yearRange);
      return NextResponse.json({
        source: 'Web of Science',
        query: originalQuery || query,
        papers: result.papers,
        totalCount: result.totalCount,
        loadedCount: result.papers.length,
        available: result.available,
        warning: result.warning,
        retstart,
        retmax,
        yearRange,
      });
    }

    const normalizedQuery = await normalizeQueryForPubMed(query || originalQuery);
    const { papers, totalCount } = await searchPubMed(normalizedQuery, retstart, retmax, yearRange);

    return NextResponse.json({
      source: 'PubMed',
      originalQuery,
      query: normalizedQuery,
      papers,
      totalCount,
      loadedCount: papers.length,
      available: true,
      retstart,
      retmax,
      yearRange,
    });
  } catch (error) {
    console.error(`[Search] ${source} lookup failed:`, error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Literature search failed',
        source,
        retryable: true,
      },
      { status: 502 },
    );
  }
}
