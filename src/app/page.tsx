'use client';

import { useEffect, useMemo, useRef, useState, useCallback, type ReactNode } from 'react';
import { ArrowLeft, ArrowUp, BarChart3, BookOpen, Bot, Check, ChevronLeft, ChevronRight, ExternalLink, FileText, Flame, History, Home, Paperclip, Pause, Pencil, PieChart, Plus, RotateCcw, Search, Send, UserRound, X } from 'lucide-react';
import type { HistoryItem, Paper } from '@/types';
import {
  addLocalFavorite,
  appendLocalMessage,
  createLocalConversation,
  deleteLocalConversation,
  getLocalMessages,
  listLocalHistory,
  listLocalLibrary,
  patchLocalConversation,
  removeLocalFavorite,
} from '@/lib/local-store';

type SidePanel = 'none' | 'search' | 'hotspots';
type LiteratureSource = 'pubmed' | 'wos';
type UserMode = 'guest' | 'demo';

interface ChatMsg {
  role: 'user' | 'assistant' | 'system';
  content: string;
  streaming?: boolean;
  attachments?: string[];
}

interface NextSuggestion {
  label: string;
  instruction: string;
}

interface IntentDecision {
  action?: string;
  searchQuery?: string;
  searchSummary?: string;
  clarification?: string;
  reason?: string;
}

const academicImages = Array.from({ length: 7 }, (_, i) => `/images/academic-${String(i + 1).padStart(2, '0')}.jpg`);
const quickActions = ['research', 'search', 'hotspots', 'topics', 'review', 'materials'];

const QUICK_HELP: Record<string, string> = {
  research: 'Discuss diseases, clinical questions, existing data or research ideas freely; the assistant asks follow-ups to help you sharpen the question.',
  search: 'Open the literature search panel. PubMed is enabled; set time and impact-factor filters, then select papers.',
  hotspots: 'Analyze field trends based on the current search scope; confirmed papers mark your direction of interest, not the only analysis scope.',
  topics: 'Gradually form a clearer research question from study objects, outcomes, methodological differences and existing evidence.',
  review: 'See how high-quality reviews are organized, get writing references and evaluation feedback on your own draft.',
  materials: 'Upload papers, Word, PDF, spreadsheets or images. Files are attached to the input first and parsed only after you hit send.',
};

const QUICK_LABELS: Record<string, string> = {
  research: 'Research Discussion',
  search: 'Literature Search',
  hotspots: 'Hotspot Analysis',
  topics: 'Topic Discussion',
  review: 'Review Guidance',
  materials: 'Materials',
};

const STAGE_MAP: Record<string, string> = {
  research: 'Research Discussion',
  search: 'Literature Search',
  hotspots: 'Hotspot Analysis',
  topics: 'Topic Discussion',
  review: 'Review Guidance',
  materials: 'Materials',

};

const DEMO_TOTAL_STEPS = 14;
const DEMO_STEP_LABELS: Record<number, string> = {
  1: 'Literature Search',
  2: 'Time Filter',
  3: 'JIF Filter',
  4: 'Load More',
  5: 'Select Papers',
  6: 'Paper Insight',
  7: 'Favorites & Library',
  8: 'Hotspot Analysis',
  9: 'Hotspot Insight',
  10: 'Topic Discussion',
  11: 'Review Guidance',
  12: 'Upload Review Draft',
  13: 'Follow-up Revision',
  14: 'Supplementary Search',
};

const EMPTY_ABSTRACT_MARKERS = [
  '(PubMed returned no parsable abstract. Click "View Details" to open the PubMed page.)',
  '(The current Web of Science results contain no abstract.)',
];

function cleanAbstract(value?: string): string {
  const text = String(value ?? '').trim();
  return EMPTY_ABSTRACT_MARKERS.includes(text) ? '' : text;
}

export default function HomePage() {
  const [view, setView] = useState<'home' | 'app' | 'library'>('home');
  const [showDemo, setShowDemo] = useState(false);
  const [demoRunning, setDemoRunning] = useState(false);
  const [demoStep, setDemoStep] = useState(0);
  const [demoNotice, setDemoNotice] = useState(false);
  const [userMode, setUserMode] = useState<UserMode>('guest');
  const [userName, setUserName] = useState('Local Researcher');
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [favorites, setFavorites] = useState<Paper[]>([]);
  const [selectedPaperIds, setSelectedPaperIds] = useState<string[]>([]);
  const [confirmedPaperIds, setConfirmedPaperIds] = useState<string[]>([]);
  const [discussionPaperIds, setDiscussionPaperIds] = useState<string[]>([]);
  const [selectionDecisionOpen, setSelectionDecisionOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([
    { role: 'assistant', content: 'Welcome. Describe a disease, clinical question or the materials you already have, or use the quick actions above.' },
  ]);
  const [nextSuggestions, setNextSuggestions] = useState<NextSuggestion[]>([]);
  const [input, setInput] = useState('');
  const [homeInput, setHomeInput] = useState('');
  const [activeQuick, setActiveQuick] = useState('research');
  const [sidePanel, setSidePanel] = useState<SidePanel>('search');
  const [rightCollapsed, setRightCollapsed] = useState(true);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [mobileHistoryOpen, setMobileHistoryOpen] = useState(false);
  const [isMobileLayout, setIsMobileLayout] = useState(false);
  const [leftWidth, setLeftWidth] = useState(250);
  const [rightWidth, setRightWidth] = useState(430);
  const [searching, setSearching] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchTotalCount, setSearchTotalCount] = useState(0);
  const [activeSearchQuery, setActiveSearchQuery] = useState('');
  const [activeOriginalSearchText, setActiveOriginalSearchText] = useState('');
  const [searchSources, setSearchSources] = useState<LiteratureSource[]>(['pubmed']);
  const [sourceTotals, setSourceTotals] = useState({ pubmed: 0, wos: 0 });
  const [sourceLoaded, setSourceLoaded] = useState({ pubmed: 0, wos: 0 });
  const [searchWarnings, setSearchWarnings] = useState<string[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const currentConversationIdRef = useRef<string | null>(null);
  const [papers, setPapers] = useState<Paper[]>([]);
  const [useJif, setUseJif] = useState(false);
  const [minJif, setMinJif] = useState(5);
  const [useTime, setUseTime] = useState(false);
  const [yearRange, setYearRange] = useState('any');
  const [uploadNote, setUploadNote] = useState('Upload materials in multiple formats; their content will be parsed for further discussion');
  const [slide, setSlide] = useState(0);
  const [profileOpen, setProfileOpen] = useState(false);
  const [librarySearch, setLibrarySearch] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [routing, setRouting] = useState(false);
  const [fileParsing, setFileParsing] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [hotspotInsight, setHotspotInsight] = useState<{ title: string; content: string } | null>(null);
  const [hotspotInsightLoading, setHotspotInsightLoading] = useState(false);
  const [toast, setToast] = useState('');
  const [paperInsight, setPaperInsight] = useState<{ paper: Paper; content: string } | null>(null);
  const [paperInsightLoading, setPaperInsightLoading] = useState(false);
  const [titleTranslations, setTitleTranslations] = useState<Record<string, string>>({});
  const [searchEditText, setSearchEditText] = useState('');
  const [renamingHistoryId, setRenamingHistoryId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [uploadedFileContext, setUploadedFileContext] = useState('');
  const [hotspotData, setHotspotData] = useState<{
    hotspots: Array<{
      name: string;
      score: number;
      reason: string;
      literatureScale?: number;
      yearlyGrowth?: number | null;
      recentActivity?: number;
      cooccurrence?: number;
      supportPmids?: string[];
      confidence?: 'low' | 'medium' | 'high';
      evidenceCoverage?: number;
      directionMatch?: number;
    }>;
    stats?: {
      total: number;
      searchTotal?: number;
      selectedDirectionCount?: number;
      yearDistribution?: Array<{ year: number; count: number }>;
      topKeywords?: string[];
    };
    analysisScope?: { fieldSample?: number; selectedDirection?: number; pubmedTotal?: number };
  } | null>(null);
  const dragMode = useRef<'left' | 'right' | null>(null);
  const searchInFlight = useRef(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatAreaRef = useRef<HTMLElement>(null);
  const autoFollowChatRef = useRef(true);
  const chatAbortRef = useRef<AbortController | null>(null);
  const suggestionKeyRef = useRef('');
  const pendingHomeFilesRef = useRef<FileList | null>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const fileContextRef = useRef('');
  const translationRequestedRef = useRef<Set<string>>(new Set());
  const journalMetricsRequestedRef = useRef<Set<string>>(new Set());
  const papersRef = useRef<Paper[]>([]);
  const confirmedPaperIdsRef = useRef<string[]>([]);
  const selectedPaperIdsRef = useRef<string[]>([]);
  const discussionContextRef = useRef<string>('');
  const hotspotContextRef = useRef<string>('');
  const activeSearchQueryRef = useRef<string>('');
  const activeOriginalSearchTextRef = useRef<string>('');
  const sourceTotalsRef = useRef({ pubmed: 0, wos: 0 });
  const sourceLoadedRef = useRef({ pubmed: 0, wos: 0 });
  const searchSourcesRef = useRef<LiteratureSource[]>(['pubmed']);
  const useTimeRef = useRef(false);
  const yearRangeRef = useRef('any');
  const searchEditTextRef = useRef('');
  const hotspotDataRef = useRef<typeof hotspotData>(null);
  const favoritesRef = useRef<Paper[]>([]);
  const userModeRef = useRef<UserMode>('guest');
  const titleTranslationsRef = useRef<Record<string, string>>({});
  const activeQuickRef = useRef('research');
  const messagesRef = useRef<ChatMsg[]>([]);
  const demoRunningRef = useRef(false);
  const searchingRef = useRef(false);
  const analyzingRef = useRef(false);
  const streamingRef = useRef(false);
  const routingRef = useRef(false);
  const fileParsingRef = useRef(false);
  const paperInsightLoadingRef = useRef(false);
  const hotspotInsightLoadingRef = useRef(false);

  // Check session on mount and handle URL params
  useEffect(() => {
    const widthMedia = window.matchMedia('(max-width: 1100px)');
    const coarseMedia = window.matchMedia('(pointer: coarse)');
    const detectMobile = () => {
      const ua = navigator.userAgent || '';
      const mobileUA = /iPhone|iPad|iPod|Android|Mobile|MicroMessenger/i.test(ua);
      const smallScreen = Math.min(window.screen?.width || 9999, window.screen?.height || 9999) <= 1100;
      setIsMobileLayout(
        mobileUA ||
        (coarseMedia.matches && smallScreen) ||
        widthMedia.matches
      );
    };
    detectMobile();
    widthMedia.addEventListener?.('change', detectMobile);
    coarseMedia.addEventListener?.('change', detectMobile);
    window.addEventListener('orientationchange', detectMobile);
    window.addEventListener('resize', detectMobile);
    return () => {
      widthMedia.removeEventListener?.('change', detectMobile);
      coarseMedia.removeEventListener?.('change', detectMobile);
      window.removeEventListener('orientationchange', detectMobile);
      window.removeEventListener('resize', detectMobile);
    };
  }, []);

  useEffect(() => {
    // Research records live in this browser.
    void loadHistoryAndLibrary();
  }, []);

  const loadHistoryAndLibrary = useCallback(async () => {
    // Records live in the browser: localStorage is the source of truth.
    setHistory(listLocalHistory());
    setFavorites(listLocalLibrary());
  }, []);

  // Slideshow
  useEffect(() => {
    const timer = window.setInterval(() => setSlide((s) => (s + 1) % academicImages.length), 4800);
    return () => window.clearInterval(timer);
  }, []);

  // Close profile card when clicking outside.
  useEffect(() => {
    if (!profileOpen) return;
    const closeOnOutside = (event: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', closeOnOutside);
    return () => document.removeEventListener('mousedown', closeOnOutside);
  }, [profileOpen]);

  // Drag resize
  useEffect(() => {
    const move = (event: MouseEvent) => {
      if (!dragMode.current) return;
      if (dragMode.current === 'left') setLeftWidth(Math.max(220, Math.min(460, event.clientX)));
      if (dragMode.current === 'right') setRightWidth(Math.max(300, Math.min(560, window.innerWidth - event.clientX)));
    };
    const up = () => {
      dragMode.current = null;
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  }, []);

  useEffect(() => {
    if (autoFollowChatRef.current) {
      chatEndRef.current?.scrollIntoView({ behavior: streaming ? 'auto' : 'smooth' });
    }
  }, [messages, streaming]);

  function handleChatScroll() {
    const el = chatAreaRef.current;
    if (!el) return;
    autoFollowChatRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 110;
  }

  function followChatToBottom() {
    autoFollowChatRef.current = true;
    window.requestAnimationFrame(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }));
  }

  const hasJifData = useMemo(
    () => papers.some((p) => typeof p.jif === 'number' && Number.isFinite(p.jif)),
    [papers],
  );

  const visiblePapers = useMemo(() => {
    return papers
      .filter((p) => {
        if (p.source === 'Dual Source') return searchSources.length > 0;
        if (p.source === 'Web of Science') return searchSources.includes('wos');
        return searchSources.includes('pubmed');
      })
      .filter((p) => {
        if (!useJif || !hasJifData) return true;
        return typeof p.jif === 'number' && p.jif >= minJif;
      })
      .sort((a, b) =>
        useJif ? (b.jif ?? -1) - (a.jif ?? -1) : (b.year ?? 0) - (a.year ?? 0),
      );
  }, [papers, searchSources, useJif, minJif, hasJifData]);

  useEffect(() => {
    if (!hasJifData && useJif) setUseJif(false);
  }, [hasJifData, useJif]);

  const recentHistory = history[0] ?? null;

  const visibleFavorites = useMemo(() => {
    const q = librarySearch.trim().toLowerCase();
    if (!q) return favorites;
    return favorites.filter((paper) =>
      [paper.title, paper.journal, paper.authors, paper.doi, paper.pmid]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q)),
    );
  }, [favorites, librarySearch]);


  const researchStateKey = useCallback(
    (conversationId: string) => `clinical-research-state:${conversationId}`,
    [],
  );

  const restoreResearchState = useCallback((conversationId: string) => {
    try {
      const raw = window.localStorage.getItem(researchStateKey(conversationId));
      if (!raw) return;
      const state = JSON.parse(raw) as {
        papers?: Paper[];
        selectedPaperIds?: string[];
        confirmedPaperIds?: string[];
        discussionPaperIds?: string[];
        hotspotData?: typeof hotspotData;
        searchTotalCount?: number;
        activeSearchQuery?: string;
        activeOriginalSearchText?: string;
        searchSources?: LiteratureSource[];
        sourceTotals?: { pubmed: number; wos: number };
        sourceLoaded?: { pubmed: number; wos: number };
        useJif?: boolean;
        minJif?: number;
        useTime?: boolean;
        yearRange?: string;
        uploadedFileContext?: string;
        activeQuick?: string;
        searchEditText?: string;
      };
      if (Array.isArray(state.papers)) setPapers(state.papers);
      if (Array.isArray(state.selectedPaperIds)) setSelectedPaperIds(state.selectedPaperIds);
      if (Array.isArray(state.confirmedPaperIds)) setConfirmedPaperIds(state.confirmedPaperIds);
      if (Array.isArray(state.discussionPaperIds)) setDiscussionPaperIds(state.discussionPaperIds);
      if (state.hotspotData) setHotspotData(state.hotspotData);
      if (typeof state.searchTotalCount === 'number') setSearchTotalCount(state.searchTotalCount);
      if (typeof state.activeSearchQuery === 'string') setActiveSearchQuery(state.activeSearchQuery);
      if (typeof state.activeOriginalSearchText === 'string') setActiveOriginalSearchText(state.activeOriginalSearchText);
      if (Array.isArray(state.searchSources) && state.searchSources.length) setSearchSources(state.searchSources);
      if (state.sourceTotals) setSourceTotals(state.sourceTotals);
      if (state.sourceLoaded) setSourceLoaded(state.sourceLoaded);
      if (typeof state.useJif === 'boolean') setUseJif(state.useJif);
      if (typeof state.minJif === 'number') setMinJif(state.minJif);
      if (typeof state.useTime === 'boolean') setUseTime(state.useTime);
      if (typeof state.yearRange === 'string') setYearRange(state.yearRange);
      if (typeof state.uploadedFileContext === 'string') {
        setUploadedFileContext(state.uploadedFileContext);
        fileContextRef.current = state.uploadedFileContext;
      }
      if (typeof state.activeQuick === 'string') setActiveQuick(state.activeQuick);
      if (typeof state.searchEditText === 'string') setSearchEditText(state.searchEditText);
    } catch (error) {
      console.warn('Failed to restore the active research state:', error);
    }
  }, [researchStateKey]);

  useEffect(() => {
    if (!currentConversationId) return;
    const snapshot = {
      papers,
      selectedPaperIds,
      confirmedPaperIds,
      discussionPaperIds,
      hotspotData,
      searchTotalCount,
      activeSearchQuery,
      activeOriginalSearchText,
      searchSources,
      sourceTotals,
      sourceLoaded,
      useJif,
      minJif,
      useTime,
      yearRange,
      uploadedFileContext,
      activeQuick,
      searchEditText,
    };
    try {
      window.localStorage.setItem(researchStateKey(currentConversationId), JSON.stringify(snapshot));
    } catch {
    }
  }, [
    currentConversationId, papers, selectedPaperIds, confirmedPaperIds, discussionPaperIds,
    hotspotData, searchTotalCount, activeSearchQuery, activeOriginalSearchText, searchSources,
    sourceTotals, sourceLoaded, useJif, minJif, useTime, yearRange, uploadedFileContext,
    activeQuick, searchEditText, researchStateKey,
  ]);

  const requestTitleTranslations = useCallback(async (items: Paper[]) => {
    const pending = items
      .filter((paper) => paper.title && !paper.titleZh && !titleTranslations[paper.id] && !translationRequestedRef.current.has(paper.id))
      .slice(0, 30);
    if (!pending.length) return;
    pending.forEach((paper) => translationRequestedRef.current.add(paper.id));
    try {
      const res = await fetch('/api/ai/paper-tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'translate_titles',
          items: pending.map((paper) => ({ id: paper.id, title: paper.title })),
        }),
      });
      const data = await res.json();
      if (!res.ok) return;
      const next: Record<string, string> = {};
      for (const item of Array.isArray(data.items) ? data.items : []) {
        if (item?.id && item?.titleZh) next[String(item.id)] = String(item.titleZh);
      }
      if (Object.keys(next).length) {
        setTitleTranslations((current) => ({ ...current, ...next }));
        setPapers((current) => current.map((paper) => next[paper.id] ? { ...paper, titleZh: next[paper.id] } : paper));
        setFavorites((current) => current.map((paper) => next[paper.id] ? { ...paper, titleZh: next[paper.id] } : paper));
      }
    } catch (error) {
      console.warn('Title translation failed:', error);
    }
  }, [titleTranslations]);

  useEffect(() => {
    void requestTitleTranslations([...visiblePapers.slice(0, 20), ...visibleFavorites.slice(0, 20)]);
  }, [visiblePapers, visibleFavorites, requestTitleTranslations]);

  const requestJournalMetrics = useCallback(async (items: Paper[]) => {
    const pending = items
      .filter((paper) => {
        const journal = (paper.journal ?? '').trim();
        return journal
          && journal !== 'Unknown Journal'
          && (paper.jif == null || !paper.jcr || paper.jcr === '—')
          && !journalMetricsRequestedRef.current.has(journal.toLowerCase());
      })
      .slice(0, 6);
    if (!pending.length) return;
    const journals = [...new Set(pending.map((paper) => paper.journal.trim()))].slice(0, 6);
    journals.forEach((journal) => journalMetricsRequestedRef.current.add(journal.toLowerCase()));
    const byJournal = new Map<string, { jif: number | null; jcr: 'Q1' | 'Q2' | 'Q3' | 'Q4' | '—' }>();
    const applyMetrics = (paper: Paper): Paper => {
      const metric = byJournal.get((paper.journal ?? '').trim().toLowerCase());
      if (!metric) return paper;
      return {
        ...paper,
        jif: paper.jif ?? metric.jif,
        jcr: paper.jcr && paper.jcr !== '—' ? paper.jcr : metric.jcr,
      };
    };
    const flush = () => {
      if (!byJournal.size) return;
      setPapers((current) => current.map(applyMetrics));
      setFavorites((current) => current.map(applyMetrics));
    };
    try {
      await new Promise<void>((resolve) => {
        if (typeof window.requestIdleCallback === 'function') {
          window.requestIdleCallback(() => resolve(), { timeout: 4000 });
        } else {
          window.setTimeout(resolve, 1200);
        }
      });
      const res = await fetch('/api/journal-metrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ journals }),
      });
      if (!res.ok) return;
      const data = await res.json();
      for (const item of Array.isArray(data.items) ? data.items : []) {
        if (item?.journal) {
          const jcrRaw = String(item.jcr ?? '—');
          const jcr: 'Q1' | 'Q2' | 'Q3' | 'Q4' | '—' =
            jcrRaw === 'Q1' || jcrRaw === 'Q2' || jcrRaw === 'Q3' || jcrRaw === 'Q4' ? jcrRaw : '—';
          byJournal.set(String(item.journal).toLowerCase(), {
            jif: typeof item.jif === 'number' ? item.jif : null,
            jcr,
          });
        }
      }
      flush();
    } catch (error) {
      console.warn('Journal metric lookup failed:', error);
      flush();
    }
  }, []);

  useEffect(() => {
    void requestJournalMetrics([...visiblePapers.slice(0, 6), ...visibleFavorites.slice(0, 6)]);
  }, [visiblePapers, visibleFavorites, requestJournalMetrics]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => { papersRef.current = papers; }, [papers]);
  useEffect(() => { confirmedPaperIdsRef.current = confirmedPaperIds; }, [confirmedPaperIds]);
  useEffect(() => { hotspotDataRef.current = hotspotData; }, [hotspotData]);
  useEffect(() => { selectedPaperIdsRef.current = selectedPaperIds; }, [selectedPaperIds]);
  useEffect(() => { activeSearchQueryRef.current = activeSearchQuery; }, [activeSearchQuery]);
  useEffect(() => { activeOriginalSearchTextRef.current = activeOriginalSearchText; }, [activeOriginalSearchText]);
  useEffect(() => { sourceTotalsRef.current = sourceTotals; }, [sourceTotals]);
  useEffect(() => { sourceLoadedRef.current = sourceLoaded; }, [sourceLoaded]);
  useEffect(() => { searchSourcesRef.current = searchSources; }, [searchSources]);
  useEffect(() => { useTimeRef.current = useTime; }, [useTime]);
  useEffect(() => { yearRangeRef.current = yearRange; }, [yearRange]);
  useEffect(() => { searchEditTextRef.current = searchEditText; }, [searchEditText]);
  useEffect(() => { favoritesRef.current = favorites; }, [favorites]);
  useEffect(() => { userModeRef.current = userMode; }, [userMode]);
  useEffect(() => { titleTranslationsRef.current = titleTranslations; }, [titleTranslations]);
  useEffect(() => { activeQuickRef.current = activeQuick; }, [activeQuick]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { searchingRef.current = searching; }, [searching]);
  useEffect(() => { analyzingRef.current = analyzing; }, [analyzing]);
  useEffect(() => { streamingRef.current = streaming; }, [streaming]);
  useEffect(() => { routingRef.current = routing; }, [routing]);
  useEffect(() => { fileParsingRef.current = fileParsing; }, [fileParsing]);
  useEffect(() => { paperInsightLoadingRef.current = paperInsightLoading; }, [paperInsightLoading]);
  useEffect(() => { hotspotInsightLoadingRef.current = hotspotInsightLoading; }, [hotspotInsightLoading]);

  const selectedPapers = useMemo(
    () => papers.filter((p) => selectedPaperIds.includes(p.id)),
    [papers, selectedPaperIds],
  );

  const confirmedPapers = useMemo(
    () => papers.filter((p) => confirmedPaperIds.includes(p.id)),
    [papers, confirmedPaperIds],
  );

  const discussionPapers = useMemo(
    () => papers.filter((p) => discussionPaperIds.includes(p.id)),
    [papers, discussionPaperIds],
  );

  const selectedDiscussionContext = useMemo(() => {
    const evidencePapers = discussionPapers.length ? discussionPapers : confirmedPapers;
    if (!evidencePapers.length) return '';
    const maxFull = 20;
    const details = evidencePapers.slice(0, maxFull).map((p, i) =>
      `${i + 1}. ${p.title}\nJournal: ${p.journal} | Year: ${p.year} | PMID: ${p.pmid ?? '—'}\nAbstract: ${cleanAbstract(p.abstract) || 'No abstract provided'}`
    ).join('\n\n');
    return `The student has confirmed ${evidencePapers.length} papers as the current primary evidence scope. When answering, first compare these papers on study objects, designs, exposures/interventions, outcomes, main findings, contradictions, and limitations; on that basis you may propose new research hypotheses, directions for further searching, and candidate topics, but any extension beyond the current literature evidence must be explicitly marked as "to be verified by further search" and never disguised as existing evidence.\n\n${details}${evidencePapers.length > maxFull ? `\n\nThe remaining ${evidencePapers.length - maxFull} papers stay in the current selected-literature set; retrieve them by question relevance when needed.` : ''}`;
  }, [discussionPapers, confirmedPapers]);

  const hotspotContext = useMemo(() => {
    const data = hotspotData;
    if (!data?.hotspots?.length) return '';
    const lines = data.hotspots.slice(0, 8).map((h, i) =>
      `${i + 1}. ${h.name} (heat ${h.score}${h.confidence ? ` | confidence ${h.confidence}` : ''}): ${h.reason}`
    ).join('\n');
    const scope = data.analysisScope
      ? `Analysis scope: field sample ${data.analysisScope.fieldSample ?? '—'} papers, selected direction ${data.analysisScope.selectedDirection ?? '—'} papers.`
      : '';
    const keywords = data.stats?.topKeywords?.length ? `Top keywords: ${data.stats.topKeywords.slice(0, 10).join(', ')}.` : '';
    return `The following research hotspots were automatically analyzed from the current search results (real analysis results; when answering topic/review questions you must combine these hotspots with the confirmed literature and never claim that no hotspot data was provided):\n${lines}\n${[scope, keywords].filter(Boolean).join(' ')}`;
  }, [hotspotData]);

  useEffect(() => { discussionContextRef.current = selectedDiscussionContext; }, [selectedDiscussionContext]);
  useEffect(() => { hotspotContextRef.current = hotspotContext; }, [hotspotContext]);

  function enterFromHome() {
    startGuest();
  }

  function handleHomeUpload(files: FileList | null) {
    if (!files?.length) return;
    pendingHomeFilesRef.current = files;
    startGuest();
  }

  function startGuest() {
    const text = homeInput.trim() || window.sessionStorage.getItem('pendingResearchQuery') || '';
    window.sessionStorage.removeItem('pendingResearchQuery');
    setUserMode('guest');
    setUserName('Local Researcher');
    setHomeInput('');
    setView('app');
    setRightCollapsed(true);
    if (pendingHomeFilesRef.current) {
      const pending = pendingHomeFilesRef.current;
      pendingHomeFilesRef.current = null;
      setPendingFiles(Array.from(pending));
      if (text) setInput(text);
    } else if (text) {
      window.setTimeout(() => void sendMessage(text, 'guest'), 60);
    }
  }

  async function startDemo() {
    if (demoRunningRef.current || demoRunning) return;
    demoRunningRef.current = true;
    const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

    setDemoNotice(true);
    await sleep(1200);
    setDemoNotice(false);

    setDemoRunning(true);
    setDemoStep(0);
    setUserMode('demo');
    setUserName('Demo Mode');
    setHomeInput('');
    setView('app');
    setLeftCollapsed(false);
    setLeftWidth(280);
    // Mobile layout renders the history sidebar as an overlay drawer only when
    // mobileHistoryOpen is true; otherwise leftover narrow-strip styles squeeze it.
    // Open the drawer during the demo so the left column shows fully expanded.
    if (typeof window !== 'undefined' && window.innerWidth <= 960) setMobileHistoryOpen(true);
    setRightCollapsed(true);
    setSidePanel('search');
    setMessages([{ role: 'assistant', content: 'Demo starting. It will walk through all core features in order: Literature Search → Time Filter → JIF Filter → Load More → Select Papers → Paper Insight → Favorites & Library → Hotspot Analysis → Hotspot Insight → Topic Discussion → Review Guidance. Please do not interact during the demo.' }]);
    setPapers([]);
    setSelectedPaperIds([]);
    setConfirmedPaperIds([]);
    setHotspotData(null);
    setInput('');
    setUseTime(false);
    setYearRange('any');
    setUseJif(false);
    setPaperInsight(null);
    setHotspotInsight(null);

    const SEARCH_QUERY = 'Search recent research progress on breast cancer';

    const waitIdle = async (maxMs = 60000) => {
      const start = Date.now();
      await sleep(500);
      while (Date.now() - start < maxMs) {
        await sleep(280);
        if (
          !searchingRef.current &&
          !analyzingRef.current &&
          !streamingRef.current &&
          !routingRef.current &&
          !fileParsingRef.current &&
          !searchInFlight.current &&
          !paperInsightLoadingRef.current &&
          !hotspotInsightLoadingRef.current
        ) return;
      }
    };

    const typeText = async (text: string, speed = 85) => {
      for (let i = 1; i <= text.length; i += 1) {
        setInput(text.slice(0, i));
        await sleep(speed);
      }
    };

    const typeAndSend = async (text: string, speed = 60) => {
      await typeText(text, speed);
      await sleep(550);
      const promise = sendMessage(text, 'demo');
      setInput('');
      await promise;
    };

    try {
      setDemoStep(1);
      setSidePanel('search');
      setRightCollapsed(false);
      await sleep(500);
      await typeAndSend(SEARCH_QUERY, 75);
      await waitIdle();
      await sleep(700);

      setDemoStep(2);
      setMessages((m) => [...m, { role: 'system', content: 'Demonstrating the time filter: narrowing the search scope to the last 3 years.' }]);
      await sleep(500);
      handleUseTimeChange(true);
      await waitIdle();
      await sleep(500);
      handleYearRangeChange('3y');
      await waitIdle();
      await sleep(700);

      setDemoStep(3);
      setMessages((m) => [...m, { role: 'system', content: 'Demonstrating the impact-factor filter: keeping only high-impact papers with JIF ≥ 5.' }]);
      await sleep(500);
      handleMinJifChange(5);
      handleUseJifChange(true);
      await waitIdle();
      await sleep(1200);
      handleUseJifChange(false);
      await sleep(500);

      setDemoStep(4);
      setMessages((m) => [...m, { role: 'system', content: 'Demonstrating Load More: paginating through the remaining search results.' }]);
      await sleep(500);
      await loadMorePapers();
      await waitIdle();
      await sleep(700);

      setDemoStep(5);
      setSidePanel('search');
      setRightCollapsed(false);
      await sleep(500);
      const demoPapers = papersRef.current.slice(0, 4);
      for (let i = 0; i < demoPapers.length; i += 1) {
        setSelectedPaperIds((ids) => (ids.includes(demoPapers[i].id) ? ids : [...ids, demoPapers[i].id]));
        await sleep(420);
      }
      await sleep(600);
      confirmPaperSelection();
      await sleep(1400);
      discussConfirmedPapers();
      await sleep(900);

      setDemoStep(6);
      setSidePanel('search');
      setRightCollapsed(false);
      await sleep(500);
      const firstConfirmedId = confirmedPaperIdsRef.current[0];
      const firstConfirmed = papersRef.current.find((p) => p.id === firstConfirmedId) || papersRef.current[0];
      if (firstConfirmed) {
        setMessages((m) => [...m, { role: 'system', content: 'Demonstrating Paper Insight: opening the AI interpretation of a single paper.' }]);
        await sleep(400);
        await interpretPaper(firstConfirmed);
        await waitIdle();
        await sleep(2200);
        setPaperInsight(null);
      }
      await sleep(500);

      setDemoStep(7);
      const favId = confirmedPaperIdsRef.current[0];
      const favPaper = papersRef.current.find((p) => p.id === favId) || papersRef.current[1] || papersRef.current[0];
      if (favPaper) {
        setMessages((m) => [...m, { role: 'system', content: 'Demonstrating favorites: adding a paper to your personal library and opening the library view.' }]);
        await sleep(400);
        await favorite(favPaper);
        await sleep(900);
        openLibraryView();
        await sleep(1800);
        setView('app');
        await sleep(500);
      }

      setDemoStep(8);
      setSidePanel('hotspots');
      setRightCollapsed(false);
      await sleep(500);
      await typeAndSend('Analyze the research hotspots within the current search scope', 45);
      await waitIdle();
      await sleep(1200);

      setDemoStep(9);
      const firstHotspot = hotspotDataRef.current?.hotspots?.[0];
      if (firstHotspot) {
        setMessages((m) => [...m, { role: 'system', content: 'Demonstrating Hotspot Insight: reviewing how a hotspot direction is formed and what evidence supports it.' }]);
        await sleep(400);
        await explainHotspot(firstHotspot);
        await waitIdle();
        await sleep(2200);
        setHotspotInsight(null);
      }
      await sleep(500);

      setDemoStep(10);
      setRightCollapsed(true);
      setSidePanel('search');
      await sleep(500);
      await typeAndSend('Based on these papers and hotspots, help me discuss research topic directions that can be narrowed down', 40);
      await waitIdle();
      await sleep(1500);
      await typeAndSend('I prefer direction 1: predictive value of biomarkers for neoadjuvant immunotherapy in triple-negative breast cancer. Help me narrow the research question further', 40);
      await waitIdle();
      await sleep(1500);

      setDemoStep(11);
      await sleep(500);
      await typeAndSend('Guide me on how to write a review in this direction, including structure suggestions and key writing points', 40);
      await waitIdle();
      await sleep(1500);

      setDemoStep(12);
      setMessages((m) => [...m, { role: 'system', content: 'Demonstrating file upload: uploading a student-written review draft for rigorous agent feedback.' }]);
      await sleep(500);
      const reviewDraftText = [
        'Progress in Biomarkers for Neoadjuvant Immunotherapy in Breast Cancer (Student Review Draft)',
        '',
        'In recent years, the application of immune checkpoint inhibitors in neoadjuvant breast cancer treatment has attracted wide attention. Multiple clinical studies suggest that PD-L1 expression, tumor mutational burden (TMB) and tumor-infiltrating lymphocytes (TILs) may be associated with pathological complete response (pCR) rates.',
        '',
        'The Keynote-522 trial confirmed that pembrolizumab combined with chemotherapy significantly improves pCR rates in early-stage triple-negative breast cancer. The Impassion031 trial showed that atezolizumab combined with chemotherapy also improves pCR. However, PD-L1 interpretation criteria differ across studies, leaving the predictive value of these biomarkers controversial.',
        '',
        'In summary, immunotherapy brings new hope to neoadjuvant breast cancer treatment, and more research is needed to explore precise biomarkers.',
      ].join('\n');
      const reviewFile = new File([reviewDraftText], 'my-review-draft-breast-cancer-neoadjuvant-immunotherapy-biomarkers.txt', { type: 'text/plain' });
      await submitAttachedFiles(
        [reviewFile],
        'This is my review draft written following the framework above. Please rigorously evaluate its weaknesses and give revision suggestions',
        'demo',
        'review',
      );
      await waitIdle();
      await sleep(1200);

      setDemoStep(13);
      await sleep(500);
      await typeAndSend('Regarding the "insufficient evidence synthesis" issue you pointed out, please demonstrate how to compare and synthesize the Keynote-522 and Impassion031 studies instead of listing them one by one', 40);
      await waitIdle();
      await sleep(1500);

      setDemoStep(14);
      await sleep(500);
      await typeAndSend('Your review mentioned inconsistent PD-L1 interpretation criteria. Please search for real literature evidence supporting this controversy', 40);
      await waitIdle();
      await sleep(1500);

      setMessages((m) => [...m, { role: 'system', content: 'Demo finished — all core features have been shown. Return home to start your own research, or watch the demo again.' }]);
    } catch (error) {
      console.warn('[Demo] The walkthrough stopped unexpectedly:', error);
    } finally {
      demoRunningRef.current = false;
      setDemoRunning(false);
      setDemoStep(0);
      setInput('');
      setPaperInsight(null);
      setHotspotInsight(null);
    }
  }

  function openLibraryView() {
    setProfileOpen(false);
    setLibrarySearch('');
    setView('library');
  }

  function requireTurn(modeOverride?: UserMode): boolean {
    void modeOverride;
    return true;
  }

  function finishTurn(modeOverride?: UserMode) {
    void modeOverride;
  }

  function applyConversationId(id: string | null) {
    currentConversationIdRef.current = id;
    setCurrentConversationId(id);
  }

  async function ensureConversation(
    title: string,
    stage: string,
    modeOverride?: UserMode,
  ): Promise<string | null> {
    const existing = currentConversationIdRef.current ?? currentConversationId;
    if (existing) return existing;
    const mode = modeOverride ?? userModeRef.current;
    if (mode === 'demo') return null;
    const id = createLocalConversation(title, stage);
    applyConversationId(id);
    setHistory(listLocalHistory());
    return id;
  }

  useEffect(() => {
    if (routing || streaming || searching || analyzing || fileParsing) return;
    const lastAssistantIndex = [...messages].map((m) => m.role).lastIndexOf('assistant');
    if (lastAssistantIndex < 0) return;
    const assistant = messages[lastAssistantIndex];
    if (!assistant?.content?.trim() || assistant.streaming) return;

    const latestUser = [...messages.slice(0, lastAssistantIndex)].reverse().find((m) => m.role === 'user');
    const signature = `${activeQuick}|${latestUser?.content ?? ''}|${assistant.content.slice(-500)}|${confirmedPapers.map((p) => p.id).join(',')}`;
    if (suggestionKeyRef.current === signature) return;
    suggestionKeyRef.current = signature;

    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 3500);
    void (async () => {
      try {
        const res = await fetch('/api/ai/suggestions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            stage: activeQuick,
            userMessage: latestUser?.content ?? '',
            assistantMessage: assistant.content,
            selectedPapers: confirmedPapers.slice(0, 6).map((p) => ({
              title: p.title,
              titleZh: p.titleZh || '',
              year: p.year,
              pmid: p.pmid,
            })),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to generate suggestions');
        const rawItems: unknown[] = Array.isArray(data.items) ? data.items : [];
        if (!rawItems.length) throw new Error('No suggestions generated');
        setNextSuggestions(
          rawItems
            .filter((item): item is NextSuggestion => {
              const candidate = item as { label?: unknown; instruction?: unknown } | null;
              return !!candidate && typeof candidate.label === 'string' && typeof candidate.instruction === 'string';
            })
            .slice(0, 4),
        );
      } catch {
        setNextSuggestions(
          activeQuick === 'review'
            ? [
                { label: 'Suggest reference formats', instruction: 'Recommend high-quality review structures suitable for the current topic and explain how to choose; do not ghostwrite the body.' },
                { label: 'Evaluate my content', instruction: 'Rigorously evaluate whether the review or outline I provide next contains substantive evidence synthesis and argumentation.' },
              ]
            : confirmedPapers.length
              ? [
                  { label: 'Compare key differences', instruction: 'Around the current discussion, compare the most critical differences among the confirmed papers, and ask one question to help me decide which direction to focus on.' },
                  { label: 'Narrow the direction', instruction: 'Do not give a final title yet; first offer 2 explorable directions, ask which I prefer, then keep narrowing.' },
                ]
              : [
                  { label: 'Clarify the question', instruction: 'Based on your last answer, ask me the single most critical question to help me define the research direction.' },
                  { label: 'Search related literature', instruction: 'Search the most relevant medical literature directly based on the current discussion.' },
                ],
        );
      } finally {
        window.clearTimeout(timer);
      }
    })();
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [messages, activeQuick, confirmedPapers, routing, streaming, searching, analyzing, fileParsing]); // dynamic-next-suggestions

  // Stream chat via SSE
  async function streamChat(userMessage: string, historyContext?: ChatMsg[], extraContext?: string) {
    if (streamingRef.current) return;
    const convId = await ensureConversation(userMessage, activeQuickRef.current);
    streamingRef.current = true;
    setStreaming(true);
    followChatToBottom();
    const controller = new AbortController();
    chatAbortRef.current = controller;

    // Add placeholder for assistant
    setMessages((m) => [...m, { role: 'assistant', content: '', streaming: true }]);

    try {
      const contextHistory = (historyContext ?? messagesRef.current)
        .filter((m) => m.role !== 'system' && !m.streaming)
        .slice(-10)
        .map((m) => ({ role: m.role, content: m.content }));

      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          message: userMessage,
          history: contextHistory,
          stage: STAGE_MAP[activeQuickRef.current] ?? activeQuickRef.current,
          context: [discussionContextRef.current, hotspotContextRef.current, fileContextRef.current, extraContext]
            .filter(Boolean)
            .join('\n\n'),
          conversationId: convId ?? undefined,
        }),
      });

      if (!res.ok || !res.body) {
        throw new Error(`Request failed (${res.status})`);
      }

      const returnedConversationId = res.headers.get('X-Conversation-Id');
      if (returnedConversationId && !convId) {
        applyConversationId(returnedConversationId);
      }
      if (convId) {
        appendLocalMessage(convId, 'user', userMessage);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;
          const payload = trimmed.slice(6);
          if (payload === '[DONE]') continue;
          try {
            const obj = JSON.parse(payload) as { content?: string; error?: string };
            if (obj.error) {
              accumulated += `\n[Error: ${obj.error}]`;
            } else if (obj.content) {
              accumulated += obj.content;
            }
            setMessages((m) => {
              const copy = [...m];
              const last = copy[copy.length - 1];
              if (last && last.role === 'assistant' && last.streaming) {
                copy[copy.length - 1] = { ...last, content: accumulated };
              }
              return copy;
            });
          } catch {
            // ignore parse error
          }
        }
      }

      const persistId = currentConversationIdRef.current ?? convId;
      if (persistId && accumulated.trim()) {
        appendLocalMessage(persistId, 'assistant', accumulated.trim());
        setHistory(listLocalHistory());
      }

      // Finalize streaming message
      setMessages((m) => {
        const copy = [...m];
        const last = copy[copy.length - 1];
        if (last && last.role === 'assistant' && last.streaming) {
          copy[copy.length - 1] = { role: 'assistant', content: accumulated || '(No response content)' };
        }
        return copy;
      });
    } catch (error) {
      const aborted = error instanceof DOMException && error.name === 'AbortError';
      setMessages((m) => {
        const copy = [...m];
        const last = copy[copy.length - 1];
        if (last && last.role === 'assistant' && last.streaming) {
          copy[copy.length - 1] = {
            role: 'assistant',
            content: aborted
              ? (last.content || 'Response stopped.')
              : `Conversation failed: ${error instanceof Error ? error.message : 'network error'}. You can try again later.`,
          };
        }
        return copy;
      });
    } finally {
      chatAbortRef.current = null;
      streamingRef.current = false;
      setStreaming(false);
    }
  }

  function stopGeneration() {
    chatAbortRef.current?.abort();
  }

  function mergePaperSets(current: Paper[], incoming: Paper[]): Paper[] {
    const normalizeTitle = (title: string) =>
      title.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, ' ').replace(/\s+/g, ' ').trim();

    const map = new Map<string, Paper>();

    const add = (paper: Paper) => {
      const doiKey = paper.doi?.trim().toLowerCase();
      const titleKey = `${normalizeTitle(paper.title)}|${paper.year ?? ''}`;
      const key = doiKey ? `doi:${doiKey}` : `title:${titleKey}`;
      const existing = map.get(key);

      if (!existing) {
        map.set(key, paper);
        return;
      }

      const sources = new Set([existing.source, paper.source]);
      const mergedSource =
        sources.has('Dual Source') ||
        (sources.has('PubMed') && sources.has('Web of Science'))
          ? 'Dual Source'
          : existing.source ?? paper.source;

      map.set(key, {
        ...existing,
        ...paper,
        id: existing.pmid ? existing.id : paper.id,
        source: mergedSource,
        pmid: existing.pmid || paper.pmid,
        doi: existing.doi || paper.doi,
        wosId: existing.wosId || paper.wosId,
        url: existing.url || paper.url,
        authors: existing.authors || paper.authors,
        abstract:
          (existing.abstract?.length ?? 0) >= (paper.abstract?.length ?? 0)
            ? existing.abstract
            : paper.abstract,
        jif: existing.jif ?? paper.jif ?? null,
        jcr: existing.jcr && existing.jcr !== '—' ? existing.jcr : paper.jcr,
        citation_count: Math.max(existing.citation_count ?? 0, paper.citation_count ?? 0) || undefined,
      });
    };

    current.forEach(add);
    incoming.forEach(add);
    return [...map.values()];
  }

  function toggleSearchSource(source: LiteratureSource) {
    if (source === 'wos') return;
    const current = searchSources;
    let next = current;
    if (current.includes(source)) {
      if (current.length === 1) return;
      next = current.filter((item) => item !== source);
    } else {
      next = source === 'pubmed'
        ? ['pubmed', ...current.filter((item) => item !== 'pubmed')]
        : [...current, 'wos'];
    }

    setSearchSources(next);
    setHotspotData(null);
    if (activeSearchQuery || activeOriginalSearchText) {
      window.setTimeout(() => void refreshSearchForTime(useTime, yearRange, next), 30);
    }
  }

  async function runSearch(
    query?: string,
    appendUser = true,
    searchSummary?: string,
    originalSearchText?: string,
    modeOverride?: UserMode,
  ) {
    if (!requireTurn(modeOverride) || searchInFlight.current || searching || analyzing || streaming || fileParsing) return;

    const q = (query || input || '').trim();
    const naturalQuery = (originalSearchText || input || q).trim();

    if (!q) {
      setMessages((m) => [...m, { role: 'system', content: 'Tell me the topic you want to search, e.g. "What are the classic studies on breast cancer".' }]);
      return;
    }

    if (!searchSourcesRef.current.length) {
      setMessages((m) => [...m, { role: 'system', content: 'Please select at least one literature database on the right first.' }]);
      setSidePanel('search');
      setRightCollapsed(false);
      return;
    }

    await ensureConversation(naturalQuery, 'search', modeOverride);
    searchInFlight.current = true;
    if (query && appendUser) setMessages((m) => [...m, { role: 'user', content: naturalQuery }]);
    else if (!query) setInput('');

    setSelectedPaperIds([]);
    setConfirmedPaperIds([]);
    setDiscussionPaperIds([]);
    setSelectionDecisionOpen(false);
    setHotspotData(null);
    setPapers([]);
    setSourceTotals({ pubmed: 0, wos: 0 });
    setSourceLoaded({ pubmed: 0, wos: 0 });
    setSearchWarnings([]);
    setSearchTotalCount(0);
    setActiveSearchQuery(q);
    setActiveOriginalSearchText(naturalQuery);
    setSearchEditText(naturalQuery);

    setSearching(true);
    setSidePanel('search');
    setRightCollapsed(false);

    const sources = searchSourcesRef.current;
    const timeOn = useTimeRef.current;
    const range = yearRangeRef.current;

    let merged: Paper[] = [];
    const nextTotals = { pubmed: 0, wos: 0 };
    const nextLoaded = { pubmed: 0, wos: 0 };
    const warnings: string[] = [];

    const searchController = new AbortController();
    const searchTimer = window.setTimeout(() => searchController.abort(), 45000);

    try {
      if (sources.includes('pubmed')) {
        const res = await fetch('/api/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: searchController.signal,
          body: JSON.stringify({
            source: 'pubmed',
            query: q,
            originalQuery: naturalQuery,
            retstart: 0,
            retmax: 100,
            yearRange: timeOn ? range : 'any',
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'PubMed search failed');

        const incoming: Paper[] = Array.isArray(data.papers) ? data.papers : [];
        merged = mergePaperSets(merged, incoming);
        nextTotals.pubmed = Number(data.totalCount ?? incoming.length);
        nextLoaded.pubmed = incoming.length;

        setPapers(merged);
        setSourceTotals({ ...nextTotals });
        setSourceLoaded({ ...nextLoaded });
        setSearchTotalCount(nextTotals.pubmed);
      }

      if (sources.includes('wos')) {
        const res = await fetch('/api/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: searchController.signal,
          body: JSON.stringify({
            source: 'wos',
            query: q,
            originalQuery: naturalQuery,
            retstart: 0,
            retmax: 50,
            yearRange: timeOn ? range : 'any',
          }),
        });
        const data = await res.json();

        if (!res.ok) {
          warnings.push(data.error || 'Web of Science search failed');
        } else {
          const incoming: Paper[] = Array.isArray(data.papers) ? data.papers : [];
          merged = mergePaperSets(merged, incoming);
          nextTotals.wos = Number(data.totalCount ?? incoming.length);
          nextLoaded.wos = incoming.length;
          if (data.warning) warnings.push(String(data.warning));
        }
      }

      setPapers(merged);
      setSourceTotals({ ...nextTotals });
      setSourceLoaded({ ...nextLoaded });
      setSearchWarnings(warnings);
      setSearchTotalCount(nextTotals.pubmed + nextTotals.wos);

      const totalFound = nextTotals.pubmed + nextTotals.wos;
      setMessages((m) => [
        ...m,
        {
          role: 'assistant',
          content: `Literature search executed: about ${totalFound.toLocaleString()} hits in total, ${merged.length} currently loaded.\nActual search query: ${q}${warnings.length ? `\nNote: ${warnings.join('; ')}` : ''}`,
        },
      ]);

    } catch (error) {
      const aborted = error instanceof DOMException && error.name === 'AbortError';
      setMessages((m) => [
        ...m,
        {
          role: 'assistant',
          content: aborted
            ? 'This literature search timed out (possibly due to network congestion or blocked requests). Please refresh the page and try again.'
            : 'This literature search did not complete. Please try again later or adjust the search criteria.',
        },
      ]);
    } finally {
      window.clearTimeout(searchTimer);
      setSearching(false);
      searchInFlight.current = false;
    }

    finishTurn(modeOverride);
  }

  async function loadMorePapers() {
    const activeQuery = activeSearchQueryRef.current;
    const activeOriginal = activeOriginalSearchTextRef.current;
    if ((!activeQuery && !activeOriginal) || searching || loadingMore || searchInFlight.current) return;

    setLoadingMore(true);
    let nextPapers = papersRef.current;
    const nextTotals = { ...sourceTotalsRef.current };
    const nextLoaded = { ...sourceLoadedRef.current };
    const warnings = [...searchWarnings];
    const sources = searchSourcesRef.current;
    const timeOn = useTimeRef.current;
    const range = yearRangeRef.current;

    try {
      if (sources.includes('pubmed') && nextLoaded.pubmed < nextTotals.pubmed) {
        const res = await fetch('/api/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source: 'pubmed',
            query: activeQuery,
            originalQuery: activeOriginal,
            retstart: nextLoaded.pubmed,
            retmax: 100,
            yearRange: timeOn ? range : 'any',
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'PubMed load failed');
        const incoming: Paper[] = Array.isArray(data.papers) ? data.papers : [];
        nextPapers = mergePaperSets(nextPapers, incoming);
        nextTotals.pubmed = Number(data.totalCount ?? nextTotals.pubmed);
        nextLoaded.pubmed += incoming.length;
      }

      if (sources.includes('wos') && nextLoaded.wos < nextTotals.wos) {
        const res = await fetch('/api/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source: 'wos',
            query: activeQuery,
            originalQuery: activeOriginal,
            retstart: nextLoaded.wos,
            retmax: 50,
            yearRange: timeOn ? range : 'any',
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          warnings.push(data.error || 'Web of Science load failed');
        } else {
          const incoming: Paper[] = Array.isArray(data.papers) ? data.papers : [];
          nextPapers = mergePaperSets(nextPapers, incoming);
          nextTotals.wos = Number(data.totalCount ?? nextTotals.wos);
          nextLoaded.wos += incoming.length;
          if (data.warning && !warnings.includes(String(data.warning))) warnings.push(String(data.warning));
        }
      }

      setPapers(nextPapers);
      setSourceTotals(nextTotals);
      setSourceLoaded(nextLoaded);
      setSearchWarnings(warnings);
      setSearchTotalCount(nextTotals.pubmed + nextTotals.wos);
    } catch (error) {
      setMessages((m) => [
        ...m,
        { role: 'assistant', content: 'Additional papers failed to load for now. Please try again later.' },
      ]);
    } finally {
      setLoadingMore(false);
    }
  }

  async function refreshSearchForTime(nextUseTime: boolean, nextYearRange: string, sourcesOverride?: LiteratureSource[]) {
    if ((!activeSearchQuery && !activeOriginalSearchText) || searchInFlight.current || searching || streaming) return;

    searchInFlight.current = true;
    setSearching(true);
    setSidePanel('search');
    setRightCollapsed(false);
    setSelectedPaperIds([]);
    setConfirmedPaperIds([]);
    setDiscussionPaperIds([]);
    setSelectionDecisionOpen(false);

    let merged: Paper[] = [];
    const nextTotals = { pubmed: 0, wos: 0 };
    const nextLoaded = { pubmed: 0, wos: 0 };
    const warnings: string[] = [];
    const filterRange = nextUseTime ? nextYearRange : 'any';
    const sources = sourcesOverride ?? searchSources;

    try {
      if (sources.includes('pubmed')) {
        const res = await fetch('/api/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source: 'pubmed',
            query: activeSearchQuery,
            originalQuery: activeOriginalSearchText,
            retstart: 0,
            retmax: 100,
            yearRange: filterRange,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'PubMed time filter failed');
        const incoming: Paper[] = Array.isArray(data.papers) ? data.papers : [];
        merged = mergePaperSets(merged, incoming);
        nextTotals.pubmed = Number(data.totalCount ?? incoming.length);
        nextLoaded.pubmed = incoming.length;
      }

      if (sources.includes('wos')) {
        const res = await fetch('/api/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source: 'wos',
            query: activeSearchQuery,
            originalQuery: activeOriginalSearchText,
            retstart: 0,
            retmax: 50,
            yearRange: filterRange,
          }),
        });
        const data = await res.json();
        if (!res.ok) warnings.push(data.error || 'Web of Science time filter failed');
        else {
          const incoming: Paper[] = Array.isArray(data.papers) ? data.papers : [];
          merged = mergePaperSets(merged, incoming);
          nextTotals.wos = Number(data.totalCount ?? incoming.length);
          nextLoaded.wos = incoming.length;
          if (data.warning) warnings.push(String(data.warning));
        }
      }

      setPapers(merged);
      setSourceTotals(nextTotals);
      setSourceLoaded(nextLoaded);
      setSearchWarnings(warnings);
      setSearchTotalCount(nextTotals.pubmed + nextTotals.wos);
    } catch (error) {
      setSearchWarnings([error instanceof Error ? error.message : 'Time filter failed']);
    } finally {
      setSearching(false);
      searchInFlight.current = false;
    }
  }

  function handleUseTimeChange(value: boolean) {
    setUseTime(value);
    setHotspotData(null);
    void refreshSearchForTime(value, yearRange);
  }

  function handleYearRangeChange(value: string) {
    setYearRange(value);
    setHotspotData(null);
    if (useTime) void refreshSearchForTime(true, value);
  }

  function handleUseJifChange(value: boolean) {
    setUseJif(value);
    setHotspotData(null);
  }

  function handleMinJifChange(value: number) {
    setMinJif(value);
    setHotspotData(null);
  }

  function clearSearchFilters() {
    const hadTimeFilter = useTime && yearRange !== 'any';
    setUseJif(false);
    setUseTime(false);
    setYearRange('any');
    setHotspotData(null);
    if (hadTimeFilter) void refreshSearchForTime(false, 'any');
  }

  async function rerunSearchFromEdit() {
    const text = searchEditTextRef.current.trim();
    if (!text || searching || analyzing || streaming) return;
    setMessages((current) => [...current, { role: 'user', content: `New search: ${text}` }]);
    try {
      const intentRes = await fetch('/api/ai/intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Search ${text}`,
          history: messagesRef.current.filter((m) => !m.streaming).slice(-6).map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const intent = await intentRes.json();
      await runSearch(intent.searchQuery || text, false, intent.searchSummary, text);
    } catch {
      await runSearch(text, false, undefined, text);
    }
  }


async function runHotspots(query?: string, appendUser = true, modeOverride?: UserMode) {
  if (!requireTurn(modeOverride) || analyzing || searching || streaming || fileParsing) return;
  if (query && appendUser) setMessages((m) => [...m, { role: 'user', content: query }]);
  else if (!query) setInput('');

  if (!papersRef.current.length && !activeSearchQueryRef.current) {
    setMessages((m) => [
      ...m,
      {
        role: 'assistant',
        content: 'Please search a research topic first. Hotspot analysis judges overall trends based on the current search scope; confirmed papers only serve as anchors for your direction of interest.',
      },
    ]);
    setSidePanel('search');
    setRightCollapsed(false);
    return;
  }

  setSelectionDecisionOpen(false);
  setAnalyzing(true);
  setSidePanel('hotspots');
  setRightCollapsed(false);

  const latestPapers = papersRef.current;
  const latestDirectionPapers = latestPapers.filter((p) => confirmedPaperIdsRef.current.includes(p.id));

  const hotspotController = new AbortController();
  const hotspotTimer = window.setTimeout(() => hotspotController.abort(), 90000);

  try {
    const res = await fetch('/api/hotspots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: hotspotController.signal,
      body: JSON.stringify({
        papers: latestPapers,
        directionPapers: latestDirectionPapers,
        query: activeSearchQueryRef.current || query || activeOriginalSearchTextRef.current,
        displayQuery: activeOriginalSearchTextRef.current || query || activeSearchQueryRef.current || activeQuick,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Hotspot analysis failed');
    setHotspotData(data);
  } catch (error) {
    console.error('[Hotspots] Analysis failed:', error);
    const aborted = error instanceof DOMException && error.name === 'AbortError';
    setMessages((m) => [...m, {
      role: 'assistant',
      content: aborted
        ? 'This hotspot analysis timed out (server-side analysis usually takes 10-30 seconds). Please refresh the page and try again.'
        : 'This hotspot analysis did not complete. Please try again later or adjust the search scope.',
    }]);
  } finally {
    window.clearTimeout(hotspotTimer);
    setAnalyzing(false);
  }
  finishTurn(modeOverride);
}

async function requestIntentWithTimeout(text: string) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 3000);
    try {
      const intentRes = await fetch('/api/ai/intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          message: text,
          history: messagesRef.current
            .filter((m) => !m.streaming)
            .slice(-8)
            .map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      if (!intentRes.ok) throw new Error(`Intent detection failed (${intentRes.status})`);
      return await intentRes.json();
    } finally {
      window.clearTimeout(timer);
    }
  }


function getImmediateAction(text: string, hiddenInstruction?: string): 'search' | 'hotspots' | null {
  const combined = `${text}
${hiddenInstruction ?? ''}`;

  // Hotspot intent must be checked before search intent: sentences like
  // "analyze research hotspots in the current scope" contain both "search" and
  // "hotspot"; matching the search regex first would wrongly trigger a literature
  // search and leave hotspot analysis unresponsive. Supports both CN and EN keywords.
  if (/hotspot|hot\s*spot|research\s+front|frontier|trend\s+analysis/i.test(combined)) {
    return 'hotspots';
  }

  // Explicit literature search must run immediately without waiting for LLM intent.
  if (
    /PubMed|Web\s*of\s*Science|WOS|JCR|Q1|Q2|search|literature|paper|article|retrieve|find\s+(papers|articles|literature)|impact\s+factor|clinical\s+evidence/i.test(combined)
  ) {
    return 'search';
  }

  return null;
}

async function sendMessage(overrideText?: string, modeOverride?: UserMode, hiddenInstruction?: string) {
    const text = (overrideText ?? input).trim();
    const effectiveMode = modeOverride ?? userMode;
    if (!text || routing || streaming || searching || analyzing || fileParsing || searchInFlight.current) {
      return;
    }
    if (!overrideText) setInput('');
    setNextSuggestions([]);
    setMessages((m) => [...m, { role: 'user', content: text }]);

    const immediateAction = getImmediateAction(text, hiddenInstruction);
    if (immediateAction === 'search') {
      await runSearch(text, false, undefined, text, effectiveMode);
      return;
    }
    if (immediateAction === 'hotspots') {
      await runHotspots(undefined, false, effectiveMode);
      return;
    }

    try {
      setRouting(true);
      let intent: IntentDecision | null = null;
      try {
        intent = await requestIntentWithTimeout(text);
      } catch (error) {
        console.warn('[Intent] Classification timed out; continuing as a discussion:', error);
      } finally {
        setRouting(false);
      }

      if (!intent?.action) {
        finishTurn(effectiveMode);
        await streamChat(text, undefined, hiddenInstruction);
        return;
      }

      if (intent.action === 'search') {
        await runSearch(intent.searchQuery || text, false, intent.searchSummary, text, effectiveMode);
        return;
      }

      if (intent.action === 'hotspots') {
        await runHotspots(undefined, false, effectiveMode);
        return;
      }

      if (intent.action === 'paper_discussion') {
        const confirmedIds = confirmedPaperIdsRef.current;
        if (!confirmedIds.length) {
          setMessages((m) => [...m, {
            role: 'assistant',
            content: 'You have not confirmed a paper scope yet. Please select papers in the search results and click "Confirm Selection" first, and I will discuss based only on those papers.',
          }]);
          setSidePanel('search');
          setRightCollapsed(false);
          finishTurn(effectiveMode);
          return;
        }
        setDiscussionPaperIds(confirmedIds);
        finishTurn(effectiveMode);
        await streamChat(text, undefined, hiddenInstruction);
        return;
      }

      if (intent.action === 'clarify') {
        setMessages((m) => [
          ...m,
          {
            role: 'assistant',
            content: intent.clarification || 'Would you like to search related literature first, or discuss the research question around this direction first?',
          },
        ]);
        finishTurn(effectiveMode);
        return;
      }

      finishTurn(effectiveMode);
      await streamChat(text, undefined, hiddenInstruction);
    } catch {
      if (/search|find\s+(papers|articles|literature)|research\s+progress|clinical\s+evidence|PubMed|Web\s*of\s*Science|impact\s+factor|JCR/i.test(text)) {
        await runSearch(text, false, undefined, text, effectiveMode);
        return;
      }
      if (/hotspot|research\s+trend|research\s+frontier/i.test(text)) {
        await runHotspots(undefined, false, effectiveMode);
        return;
      }
      finishTurn(effectiveMode);
      await streamChat(text, undefined, hiddenInstruction);
    }
  }

  function runQuick(action: string) {
    setActiveQuick(action);
    if (action === 'search') {
      setSidePanel('search');
      setRightCollapsed(false);
      if (input.trim()) {
        runSearch();
      } else {
        setMessages((m) => [
          ...m,
          {
            role: 'assistant',
            content: 'The literature search panel is now open. Tell me the search topic in the input below (e.g. "latest advances in tumor immunotherapy"); I will show the actual search query and results. You can also edit the query directly in the panel.',
          },
        ]);
      }
      return;
    }
    if (action === 'hotspots') {
      runHotspots();
      return;
    }
    const replies: Record<string, string> = {
      research: 'Just tell me what you want to study, along with the data you already have and the populations or outcomes you are interested in.',
      topics: 'We can continue discussing topics from study populations, outcomes, clinical value, existing evidence and data availability.',
      review: 'Based on your topic, you can view structural references and writing advice from high-quality reviews, or upload your own outline or review for evaluation.',
      materials: 'Uploaded materials are processed by both traditional parsing and the multimodal model; the parsed content is displayed so you can keep asking questions.',
    };
    setRightCollapsed(true);
    setMessages((m) => [...m, { role: 'assistant', content: replies[action] || 'Feel free to continue telling me your question.' }]);
  }

  function discussHotspot(name: string) {
    setActiveQuick('topics');
    setRightCollapsed(true);
    void sendMessage(
      `Keep exploring research topics around "${name}"`,
      undefined,
      `Continue the topic discussion around the hotspot "${name}". Based on the current field search results and confirmed papers, first point out the evidence differences most worth comparing, then guide the student with 1-2 key questions per turn to form their own research question from study populations, exposures/interventions, outcomes, methodological limitations, or evidence contradictions. Do not give the final title for the student; narrow it down gradually according to their subsequent answers.`,
    );
  }

  async function explainHotspot(item: NonNullable<typeof hotspotData>['hotspots'][number]) {
    setHotspotInsight({ title: item.name, content: '' });
    setHotspotInsightLoading(true);
    try {
      const res = await fetch('/api/ai/paper-tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'hotspot_insight',
          hotspot: item,
          stats: hotspotDataRef.current?.stats,
          analysisScope: hotspotDataRef.current?.analysisScope,
          directionPapers: papersRef.current
            .filter((p) => confirmedPaperIdsRef.current.includes(p.id))
            .slice(0, 12)
            .map((p) => ({
              title: p.title,
              titleZh: p.titleZh || titleTranslationsRef.current[p.id],
              year: p.year,
              pmid: p.pmid,
            })),
          query: activeOriginalSearchTextRef.current || activeSearchQueryRef.current,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Hotspot interpretation failed');
      setHotspotInsight({ title: item.name, content: String(data.content ?? '') });
    } catch (error) {
      setHotspotInsight({
        title: item.name,
        content: `This hotspot interpretation did not complete: ${error instanceof Error ? error.message : 'please try again later'}`,
      });
    } finally {
      setHotspotInsightLoading(false);
    }
  }



function attachFiles(files: FileList | null) {
  if (!files?.length || fileParsing || streaming) return;
  const additions = Array.from(files);
  setPendingFiles((current) => {
    const seen = new Set(current.map((file) => `${file.name}:${file.size}:${file.lastModified}`));
    return [
      ...current,
      ...additions.filter((file) => !seen.has(`${file.name}:${file.size}:${file.lastModified}`)),
    ].slice(0, 8);
  });
}

function removePendingFile(index: number) {
  setPendingFiles((current) => current.filter((_, i) => i !== index));
}

async function submitAttachedFiles(files: File[], pendingIntent: string, modeOverride?: UserMode, stageOverride?: string) {
  if (!files.length || fileParsing || streaming) return;
  if (!requireTurn(modeOverride)) return;

  followChatToBottom();
  const attachmentNames = files.map((file) => file.name);
  setMessages((current) => [
    ...current,
    {
      role: 'user',
      content: pendingIntent || 'Upload materials',
      attachments: attachmentNames,
    },
  ]);

  const effectiveStage = stageOverride ?? (activeQuickRef.current === 'review' ? 'review' : 'materials');
  const conversationForUpload = await ensureConversation(
    pendingIntent || attachmentNames.join(', '),
    effectiveStage,
    modeOverride,
  );
  const form = new FormData();
  files.forEach((file) => form.append('files', file));
  if (conversationForUpload) form.append('conversationId', conversationForUpload);

  setFileParsing(true);
  setUploadNote('Parsing files, please wait');

  try {
    const res = await fetch('/api/files/parse', { method: 'POST', body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Parsing failed');

    const parsedFiles = (Array.isArray(data.files) ? data.files : []) as Array<{
      name: string;
      parsedText?: string;
      parseMethod?: string;
    }>;
    const validFiles = parsedFiles.filter(
      (file) => file.name && file.parsedText && !String(file.parsedText).startsWith('File parsing failed'),
    );
    const fileNames = validFiles.map((file) => file.name);
    const newContext = validFiles
      .map((file) => `[File: ${file.name}]
${String(file.parsedText ?? '').slice(0, 18000)}`)
      .join('\n\n');

    if (newContext) {
      const combined = [fileContextRef.current, newContext].filter(Boolean).join('\n\n');
      fileContextRef.current = combined;
      setUploadedFileContext(combined);
    }

    setMessages((current) => [
      ...current,
      {
        role: 'assistant',
        content: fileNames.length
          ? `Files read: ${fileNames.join(', ')}.\n\nParsed content summary:\n${validFiles
              .map((file) => `[${file.name}] ${String(file.parsedText ?? '').replace(/\s+/g, ' ').trim().slice(0, 260)}${String(file.parsedText ?? '').length > 260 ? '…' : ''}`)
              .join('\n')}`
          : 'Files received, but no body content could be read for discussion.',
      },
    ]);
    setUploadNote(fileNames.length ? `Files read: ${fileNames.join(', ')}` : 'Files received');

    if (pendingIntent) {
      finishTurn(modeOverride);
      const reviewEvaluationHint = effectiveStage === 'review'
        ? `The content uploaded by the student may be a review, an outline, or a draft. If the student asks for evaluation, you must strictly check for substantive content: whether multiple pieces of evidence are truly synthesized, whether there is a clear theme and argumentative thread, whether differences and controversies across studies are compared, whether citations are reliable, and whether limitations and research opportunities are discussed. Do not judge quality as high just because it is long or formally worded. Only provide evaluation, reference-format recommendations, and revision suggestions - never rewrite the complete review for the student.`
        : '';
      await streamChat(
        pendingIntent,
        undefined,
        newContext
          ? `The student just uploaded files and has already stated a clear task. Answer directly based on the file content; do not ask again "what do you need". ${reviewEvaluationHint}
${newContext}`
          : 'The student just uploaded files and stated a clear task; if no readable body text is available, explain the reading limitation before answering.',
      );
    } else {
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          content: effectiveStage === 'review'
            ? 'How would you like me to handle this material? If it is your own review/outline, I can rigorously evaluate its substance, evidence synthesis, logical structure, citation quality and academic expression; I can also first recommend high-quality review formats suitable for the current topic as references.'
            : 'How would you like me to handle these materials next? I can extract key points, sort out research questions, compare literature, look for topic clues, or continue the discussion based on the materials.',
        },
      ]);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    setUploadNote(`Parsing failed: ${message}`);
    setMessages((current) => [...current, { role: 'assistant', content: `File reading did not complete: ${message}` }]);
  } finally {
    setFileParsing(false);
  }
}

async function handleComposerSend() {
  if (streaming) {
    stopGeneration();
    return;
  }
  if (routing || searching || analyzing || fileParsing) return;

  const text = input.trim();
  if (pendingFiles.length) {
    const files = [...pendingFiles];
    setPendingFiles([]);
    setInput('');
    await submitAttachedFiles(files, text);
    return;
  }
  await sendMessage();
}

function togglePaperSelection(id: string) {
    setSelectedPaperIds((ids) =>
      ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
    );
  }

  function selectVisiblePapers() {
    setSelectedPaperIds((ids) =>
      Array.from(new Set([...ids, ...visiblePapers.map((p) => p.id)])),
    );
  }

  function clearPaperSelection() {
    setSelectedPaperIds([]);
  }

  function confirmPaperSelection() {
    const ids = selectedPaperIdsRef.current;
    if (!ids.length) {
      setMessages((m) => [
        ...m,
        { role: 'assistant', content: 'You have not selected any papers yet. Please select at least 1 paper on the right first.' },
      ]);
      return;
    }

    setConfirmedPaperIds(ids);
    setDiscussionPaperIds([]);
    setHotspotData(null);
    setSelectionDecisionOpen(true);
    setRightCollapsed(true);
    setMessages((m) => [
      ...m,
      {
        role: 'assistant',
        content: `${ids.length} papers confirmed as anchors for your current research direction. Follow-up discussions will prioritize these papers as primary evidence, while hotspot analysis also considers the full current search scope.`,
      },
    ]);
  }

  function discussConfirmedPapers() {
    const ids = confirmedPaperIdsRef.current;
    if (!ids.length) return;
    setDiscussionPaperIds(ids);
    setSelectionDecisionOpen(false);
    setRightCollapsed(true);
    setActiveQuick('research');
    setMessages((m) => [
      ...m,
      {
        role: 'assistant',
        content: `OK, skipping hotspot analysis for now. I will prioritize discussing these ${ids.length} papers with you. You can ask me to compare study objects, designs, outcomes, key findings and limitations, or keep narrowing the topic based on these papers.`,
      },
    ]);
  }


async function interpretPaper(paper: Paper) {
  const bilingualPaper = {
    ...paper,
    titleZh: paper.titleZh || titleTranslationsRef.current[paper.id],
    abstract: cleanAbstract(paper.abstract),
  };
  setPaperInsight({ paper: bilingualPaper, content: '' });
  setPaperInsightLoading(true);
  try {
    const res = await fetch('/api/ai/paper-tools', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'insight', paper: bilingualPaper }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Interpretation failed');
    setPaperInsight({ paper: bilingualPaper, content: String(data.content ?? '') });
  } catch (error) {
    setPaperInsight({
      paper: bilingualPaper,
      content: `Paper interpretation failed for now: ${error instanceof Error ? error.message : 'please try again later'}`,
    });
  } finally {
    setPaperInsightLoading(false);
  }
}

function removeFavorite(id: string) {
    const next = removeLocalFavorite(id);
    setFavorites(next);
    setToast('Removed from your library');
  }

async function favorite(paper: Paper) {
  const currentFavorites = favoritesRef.current;
  const mode = userModeRef.current;
  if (currentFavorites.some((p) => p.id === paper.id)) {
    setToast('This paper is already in your library');
    return;
  }

  const paperToSave: Paper = {
    ...paper,
    titleZh: paper.titleZh || titleTranslations[paper.id] || titleTranslationsRef.current[paper.id],
    abstract: cleanAbstract(paper.abstract),
    favorite: true,
  };
  setFavorites((f) => (f.some((item) => item.id === paperToSave.id) ? f : [paperToSave, ...f]));

  if (mode === 'demo') {
    setToast('Added to favorites (kept for this demo session only)');
    return;
  }

  const next = addLocalFavorite(paperToSave);
  setFavorites(next);
  setToast('Added to your library (saved in this browser)');
}

function startNewConversation() {
    applyConversationId(null);
    setMessages([
      { role: 'assistant', content: 'Starting a new research discussion. Describe your clinical question, research interest or existing materials directly; I will first help you clarify the question, then decide whether literature search is needed.' },
    ]);
    setInput('');
    setPendingFiles([]);
    setActiveQuick('research');
    setPapers([]);
    setSelectedPaperIds([]);
    setConfirmedPaperIds([]);
    setDiscussionPaperIds([]);
    setSelectionDecisionOpen(false);
    setHotspotData(null);
    setSearchTotalCount(0);
    setSourceTotals({ pubmed: 0, wos: 0 });
    setSourceLoaded({ pubmed: 0, wos: 0 });
    setSearchWarnings([]);
    setActiveSearchQuery('');
    setActiveOriginalSearchText('');
    setSearchEditText('');
    setUploadedFileContext('');
    fileContextRef.current = '';
    setSidePanel('search');
    setRightCollapsed(true);
    setProfileOpen(false);
  }

  async function openHistoryItem(item: HistoryItem) {
    try {
      const restored = getLocalMessages(item.id);
      if (!restored.length && !window.localStorage.getItem(`clinical-research-state:${item.id}`)) {
        throw new Error('This research record has no saved content in this browser');
      }

      setMessages(
        restored.length
          ? restored
          : [{ role: 'assistant', content: `Research record restored: ${item.title}` }],
      );
      applyConversationId(item.id);
      setPapers([]);
      setSelectedPaperIds([]);
      setConfirmedPaperIds([]);
      setDiscussionPaperIds([]);
      setHotspotData(null);
      setActiveSearchQuery('');
      setActiveOriginalSearchText('');
      setSearchEditText('');
      setUploadedFileContext('');
      fileContextRef.current = '';
      restoreResearchState(item.id);
      setActiveQuick(item.stage || 'research');
      setView('app');
      setRightCollapsed(true);
    } catch (error) {
      setMessages((m) => [...m, {
        role: 'system',
        content: `Failed to restore the research record: ${error instanceof Error ? error.message : 'unknown error'}`,
      }]);
      setView('app');
    }
  }

  async function openRecentResearch() {
    if (recentHistory) {
      await openHistoryItem(recentHistory);
    } else {
      applyConversationId(null);
      setMessages([{ role: 'assistant', content: 'Welcome back. You can start a new research discussion.' }]);
      setView('app');
      setRightCollapsed(true);
    }
  }

  async function pinHistory(id: string) {
    const item = history.find((h) => h.id === id);
    if (!item) return;
    const nextPinned = !item.pinned;
    setHistory((items) =>
      items
        .map((i) => (i.id === id ? { ...i, pinned: nextPinned } : i))
        .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned))),
    );
    patchLocalConversation(id, { pinned: nextPinned });
    setHistory(listLocalHistory());
  }

  function beginRenameHistory(item: HistoryItem) {
    setRenamingHistoryId(item.id);
    setRenameDraft(item.title);
  }

  async function commitRenameHistory(id: string) {
    const title = renameDraft.trim();
    if (!title) return;
    setHistory((items) => items.map((item) => item.id === id ? { ...item, title } : item));
    setRenamingHistoryId(null);
    setRenameDraft('');
    patchLocalConversation(id, { title });
    setHistory(listLocalHistory());
  }

  async function deleteHistory(id: string) {
    deleteLocalConversation(id);
    setHistory(listLocalHistory());
    if (currentConversationId === id) {
      applyConversationId(null);
    }
  }

  if (view === 'home') {
    return (
      <main className="home-page">
        <div className="home-media">
          {academicImages.map((src, i) => (
            <img key={src} src={src} className={i === slide ? 'active' : ''} alt={`Academic background ${i + 1}`} />
          ))}
        </div>
        <div className="home-mask" />
        <header className="home-header">
          <div className="brand">
            <span className="brand-title">Clinical Research Agent Workbench</span>
          </div>
          <div className="home-actions">
            <div className="demo-entry">
              <span className="demo-hint"><span className="demo-hint-arrow">↓</span> Watch demo</span>
              <button className="demo-btn" onClick={() => void startDemo()}>Start Demo</button>
            </div>
            <button className="soft-btn" onClick={openLibraryView}><BookOpen size={16} /> My Library</button>
          </div>
        </header>
        <section className="home-content">
          <div className="hero-copy">
            <div className="eyebrow">Clinical Research Agent Workbench</div>
            <h1>Discover<br />Research <span>Questions</span> in Literature</h1>
            <p>Grounded research discussion over real medical literature: literature search, hotspot analysis, topic refinement, review-writing guidance and research history management.</p>
            <div className="home-composer small">
              <textarea
                value={homeInput}
                onChange={(e) => setHomeInput(e.target.value)}
                placeholder="e.g. recent research hotspots on CKD"
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enterFromHome(); } }}
              />
              <div className="home-compose-actions">
                <label className="icon-square" title="Upload files"><Paperclip size={18} /><input hidden type="file" multiple onChange={(e) => handleHomeUpload(e.target.files)} /></label>
                <button className="icon-square send" onClick={enterFromHome} title="Start"><Send size={17} /></button>
              </div>
            </div>
            <div className="feature-lines">
              <span>Multi-format file upload supported</span>
              <span>Real-time literature search with impact-factor and year filters</span>
              <span>Hotspot analysis and research-direction building from search results</span>
            </div>
          </div>
          <aside className="recent-box">
            <small>Recent research</small>
            <h2>Continue your evidence review</h2>
            <div className="recent-item">
              {recentHistory ? (
                <>
                  <b>{recentHistory.title}</b>
                  <span>{recentHistory.updatedAt} · {recentHistory.stage}</span>
                  <button onClick={openRecentResearch}>Resume research →</button>
                </>
              ) : (
                <>
                  <b>No research records yet</b>
                  <span>Your conversations and saved papers stay in this browser.</span>
                  <button onClick={openRecentResearch}>Enter the workbench →</button>
                </>
              )}
            </div>
          </aside>
        </section>
        <div className="thumb-rail">
          {academicImages.map((src, i) => (
            <button key={src} className={i === slide ? 'active' : ''} onClick={() => setSlide(i)}>
              <img src={src} alt="" />
              <span>{String(i + 1).padStart(2, '0')}</span>
            </button>
          ))}
        </div>
        {showDemo && (
          <div className="modal-backdrop" onClick={() => setShowDemo(false)}>
            <div className="demo-modal" onClick={(e) => e.stopPropagation()}>
              <h2>Start Demo</h2>
              <p>Type a research direction or upload files from the home page. Conversations and saved papers are stored locally in your browser.</p>
              <ul>
                <li>The left sidebar shows history only, with pin and delete.</li>
                <li>The avatar menu provides access to &quot;My Library&quot;.</li>
                <li>The six top features use compact quick commands.</li>
                <li>Only literature search and hotspot analysis expand the right panel.</li>
                <li>Both side panels collapse; hover the divider to drag-resize.</li>
              </ul>
              <button className="red-btn" onClick={() => setShowDemo(false)}>Got it</button>
            </div>
          </div>
        )}
      </main>
    );
  }

  if (view === 'library') {
    return (
      <main className="library-page">
        <header className="library-header">
          <div className="library-brand">
            <div className="library-brand-text" aria-label="Clinical Research Agent">Clinical Research Agent</div>
            <div>
              <h1>My Library</h1>
              <p>{userName} · Local Workspace</p>
            </div>
          </div>
          <button className="library-back" onClick={() => setView('app')}><ArrowLeft size={17} /> Back to Agent</button>
        </header>
        <section className="library-content">
          <div className="library-tools">
            <div>
              <span className="library-eyebrow">{favorites.length} saved</span>
              <h2>Saved Literature</h2>
            </div>
            <label className="library-search">
              <Search size={17} />
              <input
                value={librarySearch}
                onChange={(e) => setLibrarySearch(e.target.value)}
                placeholder="Search title, journal, author, PMID or DOI"
              />
            </label>
          </div>
          {visibleFavorites.length === 0 ? (
            <div className="library-empty">{favorites.length ? 'No saved papers match your search.' : 'Your library is empty. Click "Save to Library" on any search result to add one.'}</div>
          ) : (
            <div className="library-grid">
              {visibleFavorites.map((paper) => {
                const originalUrl = paper.doi ? `https://doi.org/${paper.doi}` : paper.url;
                return (
                  <article className="library-card" key={paper.id}>
                    <div className="library-card-top">
                      <span className="source-chip">{paper.source || 'Literature'}</span>
                      <span>{paper.year || '—'}</span>
                    </div>
                    <h3>{paper.title}</h3>
                    <h4 className="library-title-zh">{paper.titleZh || titleTranslations[paper.id] || 'Generating Chinese title…'}</h4>
                    <p className="library-journal">{paper.journal}</p>
                    {paper.authors && <p className="library-authors">{paper.authors}</p>}
                    <div className="library-meta">
                      {paper.pmid && <span>PMID {paper.pmid}</span>}
                      {paper.doi && <span>DOI {paper.doi}</span>}
                      <span>JIF {paper.jif ?? '—'}</span>
                      <span>{paper.jcr ?? '—'}</span>
                    </div>
                    {cleanAbstract(paper.abstract) && <p className="library-abstract">{cleanAbstract(paper.abstract)}</p>}
                    <div className="library-link-row">
                      <button className="library-ai" onClick={() => void interpretPaper(paper)}>AI Insight</button>
                      <button className="library-original" onClick={() => removeFavorite(paper.id)}>Remove</button>
                      {paper.pmid && (
                        <a className="library-original" href={`https://pubmed.ncbi.nlm.nih.gov/${paper.pmid}/`} target="_blank" rel="noopener noreferrer">
                          <ExternalLink size={15} /> PubMed
                        </a>
                      )}
                      {paper.doi && (
                        <a className="library-original" href={`https://doi.org/${paper.doi}`} target="_blank" rel="noopener noreferrer">
                          <ExternalLink size={15} /> Original
                        </a>
                      )}
                      {!paper.doi && !paper.pmid && originalUrl && (
                        <a className="library-original" href={originalUrl} target="_blank" rel="noopener noreferrer">
                          <ExternalLink size={15} /> Source
                        </a>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
        {paperInsight && (
          <PaperInsightModal
            paper={paperInsight.paper}
            content={paperInsight.content}
            loading={paperInsightLoading}
            onClose={() => setPaperInsight(null)}
          />
        )}
        {toast && <div className="toast-notice">{toast}</div>}
      </main>
    );
  }

  return (
    <main className={`app-shell ${isMobileLayout ? 'mobile-layout' : 'desktop-layout'}`}>
      {demoNotice && (
        <div className="demo-overlay">
          <div className="demo-overlay-card">
            <div className="demo-overlay-spinner" />
            <h3>Demo is about to start</h3>
            <p>Please do not interact; the system will demonstrate all features automatically.</p>
          </div>
        </div>
      )}
      {demoRunning && (
        <div className="demo-progress">
          <span className="demo-progress-label">Demo · {DEMO_STEP_LABELS[demoStep] ?? 'Preparing'}</span>
          <div className="demo-progress-track">
            <div className="demo-progress-fill" style={{ width: `${(demoStep / DEMO_TOTAL_STEPS) * 100}%` }} />
          </div>
          <span className="demo-progress-step">{demoStep}/{DEMO_TOTAL_STEPS}</span>
        </div>
      )}
      {(!isMobileLayout || !leftCollapsed) && (
      <aside className={`history-sidebar ${leftCollapsed ? 'collapsed' : ''} ${mobileHistoryOpen ? 'mobile-open' : ''} ${demoRunning ? 'demo-running' : ''}`} style={{ width: isMobileLayout ? undefined : (leftCollapsed ? 58 : leftWidth) }}>
        <div className="side-head">
          <div className="side-brand" aria-label="Clinical Research Agent">Clinical Research Agent</div>
          <button className="icon-btn" title={leftCollapsed ? 'Expand history' : 'Collapse history'} onClick={() => { if (typeof window !== 'undefined' && window.innerWidth <= 960) setMobileHistoryOpen(false); else setLeftCollapsed((v) => !v); }}>{leftCollapsed ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}</button>
        </div>
        {!leftCollapsed && (
          <>
            <div className="history-title-row">
              <div className="history-title">History</div>
              <button className="new-chat-btn" title="New conversation" onClick={startNewConversation}><Plus size={15} /></button>
            </div>
            <div className="history-list">
              {history.length === 0 && (
                <div style={{ padding: '12px', fontSize: 12, color: '#8b7a6d' }}>
                  No history yet. Conversations are saved in this browser automatically once started.
                </div>
              )}
              {history.map((item) => (
                <div
                  className={`history-card ${item.pinned ? 'pinned' : ''}`}
                  key={item.id}
                  onClick={() => { if (renamingHistoryId !== item.id) void openHistoryItem(item); }}
                >
                  <div className="history-card-main">
                    {renamingHistoryId === item.id ? (
                      <div className="history-rename" onClick={(e) => e.stopPropagation()}>
                        <input
                          value={renameDraft}
                          autoFocus
                          onChange={(e) => setRenameDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void commitRenameHistory(item.id);
                            if (e.key === 'Escape') { setRenamingHistoryId(null); setRenameDraft(''); }
                          }}
                        />
                        <button title="Save" onClick={() => void commitRenameHistory(item.id)}><Check size={13} /></button>
                        <button title="Cancel" onClick={() => { setRenamingHistoryId(null); setRenameDraft(''); }}><X size={13} /></button>
                      </div>
                    ) : (
                      <>
                        <b>{item.title}</b>
                        <span>{item.updatedAt} · {item.stage}</span>
                      </>
                    )}
                  </div>
                  <div className="history-tools">
                    <button
                      className={item.pinned ? 'active' : ''}
                      title={item.pinned ? 'Unpin' : 'Pin'}
                      onClick={(e) => { e.stopPropagation(); void pinHistory(item.id); }}
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button title="Rename" onClick={(e) => { e.stopPropagation(); beginRenameHistory(item); }}><Pencil size={13} /></button>
                    <button title="Delete" onClick={(e) => { e.stopPropagation(); void deleteHistory(item.id); }}><X size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
        {leftCollapsed && (
          <div className="collapsed-shortcuts">
            <button title="History" onClick={() => setLeftCollapsed(false)}><History size={17} /></button>
          </div>
        )}
        <div className="profile-wrap" ref={profileRef}>
          <button className="profile-button" aria-label="User info" onClick={() => setProfileOpen((v) => !v)}>
            <span className="avatar">
              {userName.slice(0, 1)}
            </span>
            {!leftCollapsed && (
              <span>
                <b>{userName}</b>
                <small>
                  {userMode === 'demo' ? 'Demo Mode' : 'Local Workspace'}
                </small>
              </span>
            )}
          </button>
          {profileOpen && (
            <div className="profile-menu">
              <div className="profile-popover-head">
                <span className="profile-popover-avatar">
                  <UserRound size={18} />
                </span>
                <div>
                  <b>{userName}</b>
                  <small>{userMode === 'demo' ? 'Demo Mode' : 'Local Workspace'}</small>
                </div>
              </div>
              <button onClick={() => { setProfileOpen(false); openLibraryView(); }}><BookOpen size={15} /> My Library <span>{favorites.length}</span></button>
            </div>
          )}
        </div>
      </aside>
      )}
      {mobileHistoryOpen && (
        <button
          className="mobile-sidebar-backdrop"
          aria-label="Close history"
          onClick={() => setMobileHistoryOpen(false)}
        />
      )}

      {!isMobileLayout && (
        <div
          className="resizer left-resizer"
          onMouseDown={() => { dragMode.current = 'left'; document.body.style.userSelect = 'none'; }}
        />
      )}

      <section className="center-panel">
        <header className="app-header">
          <h2>Research Direction & Review Agent</h2>
          <div className="app-header-actions">
            <button className="soft-btn app-home-btn" onClick={() => setView('home')}><Home size={16} /><span>Back to Home</span></button>
          </div>
        </header>

        <div className="mobile-side-controls">
            <div className="mobile-side-control-group">
              <button className="mobile-side-control" title="History" aria-label="History" onClick={() => setLeftCollapsed(false)}><History size={18} /></button>
              <button className="mobile-side-control" title="My Library" aria-label="My Library" onClick={openLibraryView}><BookOpen size={18} /></button>
            </div>
            <div className="mobile-side-control-group">
              <button className="mobile-side-control" title="Literature Search" aria-label="Literature Search" onClick={() => { setSidePanel('search'); setRightCollapsed(false); }}><Search size={18} /></button>
              <button className="mobile-side-control" title="Hotspot Analysis" aria-label="Hotspot Analysis" onClick={() => { setSidePanel('hotspots'); setRightCollapsed(false); }}><Flame size={18} /></button>
            </div>
          </div>

        <nav className="quick-strip">
          {quickActions.map((action) => (
            <button
              key={action}
              className={activeQuick === action ? 'active' : ''}
              onClick={() => runQuick(action)}
              disabled={routing || searching || analyzing || streaming || fileParsing}
              title={QUICK_HELP[action]}
              aria-label={`${QUICK_LABELS[action] ?? action}: ${QUICK_HELP[action]}`}
            >
              {QUICK_LABELS[action] ?? action}
            </button>
          ))}
        </nav>
        <section className="chat-area" ref={chatAreaRef} onScroll={handleChatScroll}>
          {messages.map((m, i) => (
            <div key={i} className={`message-row ${m.role}${m.streaming ? ' loading' : ''}`}>
              {m.role === 'assistant' && (
                <span className="bubble-avatar assistant" aria-hidden="true">
                  <Bot size={16} />
                </span>
              )}

              <div className={`message ${m.role}${m.streaming ? ' loading' : ''}`}>
                {m.attachments?.length ? (
                  <div className="message-attachments">
                    {m.attachments.map((name) => <span key={name}><FileText size={13} />{name}</span>)}
                  </div>
                ) : null}
                {m.content && m.content !== 'Upload materials' ? <RichMessage content={m.content} /> : null}
                {m.streaming && <span className="stream-cursor"> ▍</span>}
              </div>

              {m.role === 'user' && (
                <span className="bubble-avatar user" aria-hidden="true">
                  <UserRound size={15} />
                </span>
              )}
            </div>
          ))}
          {selectionDecisionOpen && confirmedPapers.length > 0 && (
            <div className="selection-decision">
              <b>{confirmedPapers.length} papers confirmed</b>
              <p>These papers serve as your direction anchors. Hotspot analysis also considers the current search scope; you can also continue discussing the selected papers first.</p>
              <div className="selection-decision-actions">
                <button className="red-btn compact" onClick={() => runHotspots(undefined, false)}>Start Hotspot Analysis</button>
                <button className="soft-btn" onClick={discussConfirmedPapers}>Discuss These Papers First</button>
                <button
                  className="soft-btn"
                  onClick={() => {
                    setSelectionDecisionOpen(false);
                    setSidePanel('search');
                    setRightCollapsed(false);
                  }}
                >
                  Reselect
                </button>
              </div>
            </div>
          )}
          {(routing || searching || analyzing || fileParsing) && (
            <ProcessLoader
              label={fileParsing ? 'Parsing files, please wait' : routing ? 'Understanding your question…' : searching ? 'Searching literature, please wait' : 'Analyzing research hotspots, please wait'}
            />
          )}
          {!routing && !searching && !analyzing && !fileParsing && !streaming && messages[messages.length - 1]?.role === 'assistant' && nextSuggestions.length > 0 && (
            <GuidanceActions
              items={nextSuggestions}
              onChoose={(label, instruction) => void sendMessage(label, undefined, instruction)}
            />
          )}
          <div ref={chatEndRef} />
        </section>
        <section className="chat-composer">
          <div className={`composer-row ${pendingFiles.length ? 'has-files' : ''}`}>
            {pendingFiles.length > 0 && (
              <div className="pending-files">
                {pendingFiles.map((file, index) => (
                  <span className="pending-file-chip" key={`${file.name}-${file.size}-${file.lastModified}`}>
                    <FileText size={13} />
                    <b title={file.name}>{file.name}</b>
                    <small>{file.size > 1024 * 1024 ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(file.size / 1024))} KB`}</small>
                    <button onClick={() => removePendingFile(index)} aria-label={`Remove ${file.name}`}><X size={12} /></button>
                  </span>
                ))}
              </div>
            )}
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={routing || streaming || searching || analyzing || fileParsing}
              placeholder={routing ? 'Understanding your question…' : streaming ? 'AI is responding; click the button on the right to pause' : 'Type your question, Shift+Enter for a new line'}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !streaming) {
                  e.preventDefault();
                  void handleComposerSend();
                }
              }}
            />
            <label className={`upload-btn ${routing || streaming || searching || analyzing || fileParsing ? 'disabled' : ''}`} title="Add attachment (not sent immediately after selection)">
              <Paperclip size={18} />
              <input hidden type="file" multiple disabled={routing || streaming || searching || analyzing || fileParsing} onChange={(e) => { attachFiles(e.target.files); e.currentTarget.value = ''; }} />
            </label>
            <button
              className={`send-btn ${streaming ? 'stop' : ''}`}
              onClick={() => void handleComposerSend()}
              disabled={!streaming && (routing || searching || analyzing || fileParsing || (!input.trim() && !pendingFiles.length))}
              title={streaming ? 'Pause/stop this response' : 'Send'}
            >
              {streaming ? <Pause size={17} /> : <Send size={17} />}
            </button>
          </div>
          <div className="parse-note">
            {fileParsing ? 'Parsing files, please wait' : pendingFiles.length ? `${pendingFiles.length} file(s) attached; parsing starts after you click send` : uploadNote}
          </div>
        </section>
      </section>

      {!isMobileLayout && (
        <div
          className="resizer right-resizer"
          onMouseDown={() => { dragMode.current = 'right'; document.body.style.userSelect = 'none'; }}
        />
      )}

      {(!isMobileLayout || !rightCollapsed) && (
      <aside
        className={`result-sidebar ${rightCollapsed ? 'collapsed' : ''} ${demoRunning ? 'demo-running' : ''}`}
        style={{ width: isMobileLayout ? undefined : (rightCollapsed ? 58 : rightWidth) }}
      >
        <div className="result-head">
          {!rightCollapsed && (
            <div>
              <h3>{sidePanel === 'hotspots' ? 'Hotspot Analysis & Rationale' : 'Literature Search Results'}</h3>
              <p>
                {sidePanel === 'hotspots'
                  ? 'Hotspot directions, yearly trends and supporting rationale'
                  : searchSources.length === 2
                    ? `PubMed ${sourceTotals.pubmed.toLocaleString()} · WoS ${sourceTotals.wos.toLocaleString()} · Merged ${papers.length} · Showing ${visiblePapers.length}`
                    : `${searchTotalCount.toLocaleString()} papers across all years · ${papers.length} loaded · Showing ${visiblePapers.length}`}
              </p>
            </div>
          )}
          <button className="icon-btn" title={rightCollapsed ? 'Expand results panel' : 'Collapse results panel'} onClick={() => setRightCollapsed((v) => !v)}>{rightCollapsed ? <ChevronLeft size={17} /> : <ChevronRight size={17} />}</button>
        </div>
        {rightCollapsed ? (
          <div className="collapsed-shortcuts result-shortcuts">
            <button title="Literature Search" onClick={() => { setSidePanel('search'); setRightCollapsed(false); }}><Search size={17} /></button>
            <button title="Hotspot Analysis" onClick={() => { setSidePanel('hotspots'); setRightCollapsed(false); }}><Flame size={17} /></button>
          </div>
        ) : (
          <div className="result-body">
            {sidePanel === 'hotspots' ? (
              <HotspotPanel data={hotspotData} selectedCount={confirmedPapers.length} onDiscuss={discussHotspot} onExplain={explainHotspot} />
            ) : (
              <SearchPanel
                papers={visiblePapers}
                selectedIds={selectedPaperIds}
                sources={searchSources}
                onToggleSource={toggleSearchSource}
                sourceTotals={sourceTotals}
                sourceLoaded={sourceLoaded}
                warnings={searchWarnings}
                hasJifData={hasJifData}
                onToggleSelected={togglePaperSelection}
                onSelectVisible={selectVisiblePapers}
                onClearSelected={clearPaperSelection}
                onConfirmSelected={confirmPaperSelection}
                useJif={useJif}
                setUseJif={handleUseJifChange}
                minJif={minJif}
                setMinJif={handleMinJifChange}
                useTime={useTime}
                setUseTime={handleUseTimeChange}
                yearRange={yearRange}
                setYearRange={handleYearRangeChange}
                onClearFilters={clearSearchFilters}
                onFavorite={favorite}
                onInterpret={interpretPaper}
                titleTranslations={titleTranslations}
                searchText={searchEditText}
                setSearchText={setSearchEditText}
                onRerunSearch={rerunSearchFromEdit}
                searching={searching}
                totalCount={searchTotalCount}
                loadedCount={papers.length}
                loadingMore={loadingMore}
                onLoadMore={loadMorePapers}
              />
            )}
            {!rightCollapsed && sidePanel === 'search' && confirmedPapers.length >= 2 && (
              <div className="sidebar-evidence">
                <EvidenceOverview papers={confirmedPapers} onChoose={(label, instruction) => void sendMessage(label, undefined, instruction)} />
              </div>
            )}
          </div>
        )}
      </aside>
      )}

      {paperInsight && (
        <PaperInsightModal
          paper={paperInsight.paper}
          content={paperInsight.content}
          loading={paperInsightLoading}
          onClose={() => setPaperInsight(null)}
          demoRunning={demoRunning}
        />
      )}
      {hotspotInsight && (
        <HotspotInsightModal
          title={hotspotInsight.title}
          content={hotspotInsight.content}
          loading={hotspotInsightLoading}
          onClose={() => setHotspotInsight(null)}
          demoRunning={demoRunning}
        />
      )}
      {toast && <div className="toast-notice">{toast}</div>}
    </main>
  );
}



function PaperInsightModal({
  paper,
  content,
  loading,
  onClose,
  demoRunning,
}: {
  paper: Paper;
  content: string;
  loading: boolean;
  onClose: () => void;
  demoRunning?: boolean;
}) {
  return (
    <div className={`paper-insight-backdrop ${demoRunning ? 'demo-running-modal' : ''}`} onMouseDown={onClose}>
      <div className="paper-insight-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="paper-insight-head">
          <div>
            <small>Single Paper · AI Insight</small>
            <h3>{paper.title}</h3>
            {paper.titleZh && <p>{paper.titleZh}</p>}
          </div>
          <button onClick={onClose} aria-label="Close"><X size={17} /></button>
        </div>
        <div className="paper-insight-meta">
          {paper.journal && <span>{paper.journal}</span>}
          {paper.year && <span>{paper.year}</span>}
          {paper.pmid && <span>PMID {paper.pmid}</span>}
          {paper.doi && <span>DOI {paper.doi}</span>}
        </div>
        <div className="paper-insight-body">
          {loading ? <ProcessLoader label="Interpreting this paper, please wait" /> : <RichMessage content={content} />}
        </div>
        <div className="paper-insight-links">
          {paper.pmid && <a href={`https://pubmed.ncbi.nlm.nih.gov/${paper.pmid}/`} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /> PubMed</a>}
          {paper.doi && <a href={`https://doi.org/${paper.doi}`} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /> Original Article</a>}
        </div>
      </div>
    </div>
  );
}


function HotspotInsightModal({
  title,
  content,
  loading,
  onClose,
  demoRunning,
}: {
  title: string;
  content: string;
  loading: boolean;
  onClose: () => void;
  demoRunning?: boolean;
}) {
  return (
    <div className={`paper-insight-backdrop ${demoRunning ? 'demo-running-modal' : ''}`} onMouseDown={onClose}>
      <div className="paper-insight-modal hotspot-insight-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="paper-insight-head">
          <div>
            <small>Research Hotspot · AI Analysis</small>
            <h3>{title}</h3>
            <p>Explains research signals within the current search scope and raises questions that need further verification and thinking.</p>
          </div>
          <button onClick={onClose} aria-label="Close"><X size={17} /></button>
        </div>
        <div className="paper-insight-body">
          {loading ? <ProcessLoader label="Analyzing this hotspot, please wait" /> : <RichMessage content={content} />}
        </div>
      </div>
    </div>
  );
}

function EvidenceOverview({
  papers,
  onChoose,
}: {
  papers: Paper[];
  onChoose: (label: string, instruction: string) => void;
}) {
  const byYear = new Map<number, number>();
  const byType = new Map<string, number>();
  let pubmed = 0;
  let wos = 0;
  let dual = 0;

  for (const paper of papers) {
    const year = Number(paper.year);
    if (Number.isFinite(year) && year > 1900) byYear.set(year, (byYear.get(year) ?? 0) + 1);
    const type = String(paper.type || 'Untyped').slice(0, 24);
    byType.set(type, (byType.get(type) ?? 0) + 1);
    if (paper.source === 'Dual Source') dual += 1;
    else if (paper.source === 'Web of Science') wos += 1;
    else pubmed += 1;
  }

  const years = [...byYear.entries()].sort((a, b) => a[0] - b[0]).slice(-8);
  const maxYear = Math.max(1, ...years.map(([, count]) => count));
  const types = [...byType.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const total = Math.max(1, papers.length);
  const pubmedDeg = (pubmed / total) * 360;
  const dualDeg = pubmedDeg + (dual / total) * 360;

  return (
    <details className="evidence-overview">
      <summary><BarChart3 size={15} /> Selected Papers Visualization <span>{papers.length} papers</span></summary>
      <div className="evidence-viz-grid">
        <div className="viz-card">
          <div className="viz-title"><PieChart size={14} /> Source Composition</div>
          <div className="donut-row">
            <div
              className="source-donut"
              style={{ background: `conic-gradient(#2474d8 0deg ${pubmedDeg}deg, #ad2028 ${pubmedDeg}deg ${dualDeg}deg, #2ba7a0 ${dualDeg}deg 360deg)` }}
            >
              <span>{papers.length}</span>
            </div>
            <div className="donut-legend">
              <span><i className="dot pubmed" />PubMed {pubmed}</span>
              <span><i className="dot dual" />Dual-source {dual}</span>
              <span><i className="dot wos" />WoS {wos}</span>
            </div>
          </div>
        </div>
        <div className="viz-card">
          <div className="viz-title"><BarChart3 size={14} /> Year Distribution</div>
          <div className="year-bars">
            {years.map(([year, count]) => (
              <div key={year} className="year-bar-item" title={`${year}: ${count} papers`}>
                <i style={{ height: `${Math.max(12, (count / maxYear) * 100)}%` }} />
                <small>{String(year).slice(-2)}</small>
              </div>
            ))}
          </div>
        </div>
        <div className="viz-card wide">
          <div className="viz-title">Research Type Heatmap</div>
          <div className="type-heatmap">
            {types.map(([type, count]) => {
              const ratio = count / Math.max(1, types[0]?.[1] ?? 1);
              return <button key={type} style={{ opacity: 0.48 + ratio * 0.52 }} onClick={() => onChoose(`Compare "${type}" studies`, `Focus on comparing the "${type}" studies among the confirmed papers, and explain what these studies imply for topic selection in terms of population, design, outcomes, and limitations.`)}>{type}<b>{count}</b></button>;
            })}
          </div>
        </div>
      </div>
      <div className="evidence-viz-actions">
        <button onClick={() => onChoose('Compare design differences', 'Compare the study designs, populations, exposures or interventions, and outcome differences of these confirmed papers, present them in a table, and point out the difference most worth following up.')}>Compare Designs</button>
        <button onClick={() => onChoose('Find contradictions & limitations', 'Look through the confirmed papers for inconsistent results, methodological limitations, or unresolved issues, and help me discover new research questions through questioning.')}>Find Contradictions</button>
        <button onClick={() => onChoose('Compare study outcomes', 'Compare the endpoints and outcome measures of these papers, and see whether new topic directions can be found from the outcome differences.')}>Compare Outcomes</button>
      </div>
    </details>
  );
}


function ProcessLoader({ label }: { label: string }) {
  return (
    <div className="process-loader" role="status" aria-live="polite">
      <span className="process-spinner" />
      <span>{label}</span>
    </div>
  );
}

function GuidanceActions({
  items,
  onChoose,
}: {
  items: NextSuggestion[];
  onChoose: (label: string, instruction: string) => void;
}) {
  if (!items.length) return null;
  return (
    <div className="guidance-block dynamic-guidance">
      <div className="guidance-actions">
        {items.map((item) => (
          <button key={`${item.label}-${item.instruction}`} onClick={() => onChoose(item.label, item.instruction)}>
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function InlineRichText({ text }: { text: string }) {
  const parts: Array<ReactNode> = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)]+\))/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = pattern.exec(text))) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const token = match[0];
    if (token.startsWith('**')) {
      parts.push(<strong key={index++}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('`')) {
      parts.push(<code key={index++}>{token.slice(1, -1)}</code>);
    } else {
      const link = token.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/);
      if (link) parts.push(<a key={index++} href={link[2]} target="_blank" rel="noopener noreferrer">{link[1]}</a>);
    }
    last = match.index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

function normalizeRichContent(value: string): string {
  return value
    .replace(/&lt;br\s*\/?&gt;/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/\*\*(Next Optional Actions?)\*\*/g, 'Suggested Next Steps')
    .replace(/^#{1,5}\s*(Next Optional Actions?)\s*$/gim, 'Suggested Next Steps');
}

function isTableSeparator(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (!/^[\s|:—-]+$/.test(t)) return false;
  if (!t.includes('-') && !t.includes('—')) return false;
  const cells = t.replace(/^\|/, '').replace(/\|$/, '').split('|');
  return cells.every((cell) => /^\s*:?\s*(-{1,}|—{1,})\s*:?\s*$/.test(cell));
}

function RichMessage({ content }: { content: string }) {
  const lines = normalizeRichContent(content).replace(/\r/g, '').split('\n');
  const nodes: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) { i += 1; continue; }

    // Markdown table -> actual visual table.
    if (line.includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const headers = line.replace(/^\||\|$/g, '').split('|').map((x) => x.trim());
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
        rows.push(lines[i].trim().replace(/^\||\|$/g, '').split('|').map((x) => x.trim()));
        i += 1;
      }
      nodes.push(
        <div className="rich-table-wrap" key={`t-${i}`}>
          <table className="rich-table">
            <thead><tr>{headers.map((h, j) => <th key={j}><InlineRichText text={h} /></th>)}</tr></thead>
            <tbody>{rows.map((row, r) => <tr key={r}>{headers.map((_, c) => <td key={c}><InlineRichText text={row[c] ?? ''} /></td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      nodes.push(<h4 className={`rich-heading level-${heading[1].length}`} key={`h-${i}`}><InlineRichText text={heading[2]} /></h4>);
      i += 1;
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, '').trim()); i += 1;
      }
      nodes.push(<ul className="rich-list" key={`ul-${i}`}>{items.map((item, j) => <li key={j}><InlineRichText text={item} /></li>)}</ul>);
      continue;
    }

    if (/^\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+[.)]\s+/, '').trim()); i += 1;
      }
      nodes.push(<ol className="rich-list" key={`ol-${i}`}>{items.map((item, j) => <li key={j}><InlineRichText text={item} /></li>)}</ol>);
      continue;
    }

    if (/^---+$/.test(line)) { nodes.push(<hr className="rich-rule" key={`hr-${i}`} />); i += 1; continue; }

    const para: string[] = [line];
    i += 1;
    while (i < lines.length && lines[i].trim() && !/^(#{1,4})\s+/.test(lines[i].trim()) && !/^[-*]\s+/.test(lines[i].trim()) && !/^\d+[.)]\s+/.test(lines[i].trim()) && !(lines[i].includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1]))) {
      para.push(lines[i].trim()); i += 1;
    }
    nodes.push(<p className="rich-paragraph" key={`p-${i}`}><InlineRichText text={para.join(' ')} /></p>);
  }
  return <div className="rich-message">{nodes}</div>;
}

function SearchPanel(props: {
  papers: Paper[];
  selectedIds: string[];
  sources: LiteratureSource[];
  onToggleSource: (source: LiteratureSource) => void;
  sourceTotals: { pubmed: number; wos: number };
  sourceLoaded: { pubmed: number; wos: number };
  warnings: string[];
  hasJifData: boolean;
  onToggleSelected: (id: string) => void;
  onSelectVisible: () => void;
  onClearSelected: () => void;
  onConfirmSelected: () => void;
  useJif: boolean;
  setUseJif: (v: boolean) => void;
  minJif: number;
  setMinJif: (v: number) => void;
  useTime: boolean;
  setUseTime: (v: boolean) => void;
  yearRange: string;
  setYearRange: (v: string) => void;
  onClearFilters: () => void;
  onFavorite: (p: Paper) => void;
  onInterpret: (p: Paper) => void;
  titleTranslations: Record<string, string>;
  searchText: string;
  setSearchText: (value: string) => void;
  onRerunSearch: () => void;
  searching?: boolean;
  totalCount: number;
  loadedCount: number;
  loadingMore: boolean;
  onLoadMore: () => void;
}) {
  const canLoadMore =
    (props.sources.includes('pubmed') && props.sourceLoaded.pubmed < props.sourceTotals.pubmed) ||
    (props.sources.includes('wos') && props.sourceLoaded.wos < props.sourceTotals.wos);

  return (
    <>
      <div className="source-selector">
        <div className="source-selector-title">Literature Databases</div>
        <label className={props.sources.includes('pubmed') ? 'selected' : ''}>
          <input
            type="checkbox"
            checked={props.sources.includes('pubmed')}
            disabled={props.searching}
            onChange={() => props.onToggleSource('pubmed')}
          />
          <span>PubMed</span>
          <small>Preferred</small>
        </label>
        <label className={props.sources.includes('wos') ? 'selected' : ''} title="Web of Science is unavailable until an API key is configured">
          <input
            type="checkbox"
            checked={props.sources.includes('wos')}
            disabled
            onChange={() => props.onToggleSource('wos')}
          />
          <span>Web of Science</span>
          <small>API not configured</small>
        </label>
        <div className="source-selector-note">
          Only PubMed search is currently enabled; Web of Science is unavailable until an API key is configured.
        </div>
      </div>

      <div className="search-edit-row">
        <Search size={14} />
        <input
          value={props.searchText}
          onChange={(e) => props.setSearchText(e.target.value)}
          placeholder="Edit search query"
          onKeyDown={(e) => { if (e.key === 'Enter') props.onRerunSearch(); }}
        />
        <button onClick={props.onRerunSearch} disabled={!props.searchText.trim() || props.searching}>Search Again</button>
      </div>

      <div className="selection-toolbar">
        <span><b>{props.selectedIds.length}</b> selected</span>
        <button onClick={props.onSelectVisible} disabled={!props.papers.length}>Select All Visible</button>
        <button onClick={props.onClearSelected} disabled={!props.selectedIds.length}>Clear</button>
        <button className="confirm" onClick={props.onConfirmSelected} disabled={!props.selectedIds.length}>Confirm Selection</button>
        <button className="filter-reset" onClick={props.onClearFilters}><RotateCcw size={13} /> Reset Filters</button>
      </div>

      <div className="filter-grid">
        <label>
          <input
            type="checkbox"
            checked={props.useJif}
            disabled={!props.hasJifData}
            onChange={(e) => props.setUseJif(e.target.checked)}
          /> Impact Factor
        </label>
        <select
          value={props.minJif}
          onChange={(e) => props.setMinJif(Number(e.target.value))}
          disabled={!props.useJif || !props.hasJifData}
        >
          <option value={0}>Any</option>
          <option value={3}>≥ 3</option>
          <option value={5}>≥ 5</option>
          <option value={10}>≥ 10</option>
          <option value={20}>≥ 20</option>
        </select>
        <label>
          <input type="checkbox" checked={props.useTime} onChange={(e) => props.setUseTime(e.target.checked)} /> Publication Date
        </label>
        <select value={props.yearRange} onChange={(e) => props.setYearRange(e.target.value)} disabled={!props.useTime}>
          <option value="any">Any time</option>
          <option value="1y">Last 1 year</option>
          <option value="3y">Last 3 years</option>
          <option value="5y">Last 5 years</option>
        </select>
      </div>
      {props.searching && <div className="search-inline-status">Searching the selected databases…</div>}
      {(props.totalCount > 0 || props.loadedCount > 0) && (
        <div className="search-total-note">
          {props.sources.length === 2
            ? `PubMed ${props.sourceTotals.pubmed.toLocaleString()} · Web of Science ${props.sourceTotals.wos.toLocaleString()} · ${props.loadedCount} after merge & dedupe`
            : `${props.totalCount.toLocaleString()} papers found · ${props.loadedCount} loaded`}
        </div>
      )}
      {props.papers.map((p) => {
        const selected = props.selectedIds.includes(p.id);
        return (
        <article className={`paper-card selectable ${selected ? 'selected' : ''}`} key={p.id}>
          <label className="paper-check" title={selected ? 'Deselect' : 'Select this paper'}>
            <input type="checkbox" checked={selected} onChange={() => props.onToggleSelected(p.id)} />
            <span>{selected ? '✓' : ''}</span>
          </label>
          <h4>{p.title}</h4>
          <div className="paper-title-zh">{p.titleZh || props.titleTranslations[p.id] || 'Generating Chinese title…'}</div>
          <div className="paper-meta">
            <span>{p.journal}</span>
            <span>{p.year}</span>
            <span>JIF {p.jif ?? '—'}</span>
            <span>{p.jcr}</span>
            <span>{p.source}</span>
            {p.pmid && <span>PMID: {p.pmid}</span>}
            {p.wosId && <span>WoS: {p.wosId}</span>}
          </div>
          {cleanAbstract(p.abstract) && <p>{cleanAbstract(p.abstract)}</p>}
          <div className="paper-actions">
            {p.url ? (
              <a href={p.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--red)', fontSize: 11 }}>
                View Details
              </a>
            ) : (
              <button>View Details</button>
            )}
            <button onClick={() => props.onInterpret(p)}>AI Insight</button>
            <button onClick={() => props.onFavorite({ ...p, titleZh: p.titleZh || props.titleTranslations[p.id] })} disabled={p.favorite}>
              {p.favorite ? 'Saved' : 'Save to Library'}
            </button>
          </div>
        </article>
        );
      })}
      {canLoadMore && (
        <button className="load-more-papers" onClick={props.onLoadMore} disabled={props.loadingMore}>
          {props.loadingMore ? 'Loading more…' : 'Load More Papers'}
        </button>
      )}
    </>
  );
}


function HotspotPanel({
  data,
  selectedCount,
  onDiscuss,
  onExplain,
}: {
  selectedCount: number;
  onDiscuss: (name: string) => void;
  onExplain: (item: {
    name: string;
    score: number;
    reason: string;
    literatureScale?: number;
    yearlyGrowth?: number | null;
    recentActivity?: number;
    cooccurrence?: number;
    supportPmids?: string[];
    confidence?: 'low' | 'medium' | 'high';
    evidenceCoverage?: number;
    directionMatch?: number;
  }) => void;
  data: {
    hotspots: Array<{
      name: string;
      score: number;
      reason: string;
      literatureScale?: number;
      yearlyGrowth?: number | null;
      recentActivity?: number;
      cooccurrence?: number;
      supportPmids?: string[];
      confidence?: 'low' | 'medium' | 'high';
      evidenceCoverage?: number;
      directionMatch?: number;
    }>;
    stats?: {
      total: number;
      searchTotal?: number;
      selectedDirectionCount?: number;
      yearDistribution?: Array<{ year: number; count: number }>;
      topKeywords?: string[];
    };
    analysisScope?: { fieldSample?: number; selectedDirection?: number; pubmedTotal?: number };
  } | null;
}) {
  if (!data || !data.hotspots?.length) {
    return (
      <div className="hotspot-empty">
        <Flame size={18} />
        <span>After completing a literature search, you can view overall research hotspots here; your confirmed papers serve as interest anchors, not the only analysis scope.</span>
      </div>
    );
  }

  const maxScale = Math.max(1, ...data.hotspots.map((item) => item.literatureScale ?? 0));
  const fieldSample = data.analysisScope?.fieldSample ?? data.stats?.total ?? 0;
  const pubmedTotal = data.analysisScope?.pubmedTotal ?? data.stats?.searchTotal ?? 0;
  const directionCount = data.analysisScope?.selectedDirection ?? selectedCount;

  return (
    <div className="hotspot-results">
      <div className="hotspot-summary">
        <b>Hotspot Analysis & Rationale</b>
        <span>
          Judged comprehensively from the current search scope and an extended literature sample; the {directionCount} confirmed papers mark your direction of interest and do not limit hotspot judgment to just those papers.
        </span>
        <small>
          Current analysis sample: {fieldSample} papers{pubmedTotal ? ` · ~${pubmedTotal.toLocaleString()} total PubMed hits` : ''}
        </small>
      </div>
      <details className="hotspot-method">
        <summary>View scoring criteria</summary>
        <div>
          <span>Literature scale 25%</span>
          <span>Activity in last 3 years 25%</span>
          <span>Yearly change 20%</span>
          <span>Topic co-occurrence 20%</span>
          <span>Direction match 10%</span>
        </div>
        <p>Scores compare relative research signals under the current search topic; they are not equivalent to a &quot;proven research gap&quot;. Direction match only indicates proximity to the papers you have selected.</p>
      </details>
      <div className="hotspot-cards">
        {data.hotspots.map((h, i) => (
          <article className="hotspot-evidence-card" key={h.name + i}>
            <div className="hotspot-card-heading">
              <h4>{h.name}</h4>
              <div className="hotspot-score">
                <strong>{h.score}/100</strong>
                <small>{h.confidence === 'high' ? 'Adequate sample' : h.confidence === 'medium' ? 'Moderate sample' : 'Exploratory'}</small>
              </div>
            </div>
            <MetricRow label="Literature scale" value={h.literatureScale ?? 0} max={maxScale} display={`${h.literatureScale ?? 0}`} />
            <MetricRow label="Yearly change" value={h.yearlyGrowth == null ? 0 : Math.min(Math.max(h.yearlyGrowth + 100, 0), 300)} max={300} display={h.yearlyGrowth == null ? 'Insufficient sample' : `${h.yearlyGrowth}%`} />
            <MetricRow label="Recent activity" value={h.recentActivity ?? 0} max={100} display={`${h.recentActivity ?? 0}%`} />
            <MetricRow label="Topic co-occurrence" value={h.cooccurrence ?? 0} max={100} display={`${h.cooccurrence ?? 0}%`} />
            <MetricRow label="Direction match" value={h.directionMatch ?? 0} max={100} display={directionCount ? `${h.directionMatch ?? 0}%` : 'No direction set'} />
            <div className="hotspot-reason">
              <b>Why it matters:</b>
              <span>{h.reason}</span>
              {h.supportPmids?.length ? (
                <small className="support-pmids">Representative PMIDs: {h.supportPmids.map((pmid, index) => (
                  <span key={pmid}>{index > 0 ? ', ' : ''}<a href={`https://pubmed.ncbi.nlm.nih.gov/${pmid}/`} target="_blank" rel="noopener noreferrer">{pmid}</a></span>
                ))}</small>
              ) : null}
            </div>
            <div className="hotspot-actions">
              <button className="primary" onClick={() => onDiscuss(h.name)}>Explore Topics in This Direction</button>
              <button onClick={() => onExplain(h)}>AI Hotspot Analysis</button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function MetricRow({
  label,
  value,
  max,
  display,
}: {
  label: string;
  value: number;
  max: number;
  display: string;
}) {
  const ratio = Math.min(100, Math.max(0, (value / Math.max(max, 1)) * 100));
  return (
    <div className="metric-row">
      <span>{label}</span>
      <div><i style={{ width: `${ratio}%` }} /></div>
      <b>{display}</b>
    </div>
  );
}
