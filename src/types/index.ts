export type Role = 'guest' | 'student' | 'teacher';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
}

export interface Paper {
  id: string;
  pmid: string;
  title: string;
  titleZh?: string;
  authors?: string;
  journal: string;
  year?: number;
  jif?: number | null;
  jcr?: 'Q1' | 'Q2' | 'Q3' | 'Q4' | '—';
  type?: string;
  pub_type?: string[];
  abstract?: string;
  source?: 'PubMed' | 'Web of Science' | 'Dual Source';
  doi?: string;
  wosId?: string;
  keywords?: string[];
  quartile?: string;
  citation_count?: number;
  is_pubmed_central?: boolean;
  pmcid?: string;
  url?: string;
  favorite?: boolean;
}

export interface HistoryItem {
  id: string;
  title: string;
  stage: string;
  updatedAt: string;
  pinned?: boolean;
}
