import type { HistoryItem, Paper } from '@/types';

/**
 * Browser-local persistence layer.
 *
 * After login was removed, research records (conversation history, messages
 * and favorite literature) are kept in the browser via localStorage so users
 * can close the tab and resume later on the same device.
 *
 * All helpers are defensive: when localStorage is unavailable (private mode,
 * quota exceeded) they degrade to in-memory no-ops instead of throwing.
 */

export interface StoredMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface StoredConversation {
  id: string;
  title: string;
  stage: string;
  updatedAt: string;
  pinned: boolean;
  messages: StoredMessage[];
}

const CONV_KEY = 'clinical-research:conversations';
const LIBRARY_KEY = 'clinical-research:library';
const MAX_CONVERSATIONS = 60;
const MAX_MESSAGES_PER_CONVERSATION = 200;

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function loadConversations(): StoredConversation[] {
  const list = readJson<StoredConversation[]>(CONV_KEY, []);
  return Array.isArray(list) ? list : [];
}

function saveConversations(list: StoredConversation[]): void {
  writeJson(CONV_KEY, list.slice(0, MAX_CONVERSATIONS));
}

function nowIso(): string {
  return new Date().toISOString();
}

function toHistoryItem(conv: StoredConversation): HistoryItem {
  return {
    id: conv.id,
    title: conv.title,
    stage: conv.stage,
    updatedAt: conv.updatedAt,
    pinned: Boolean(conv.pinned),
  };
}

/** Create a new local conversation and return its id. */
export function createLocalConversation(title: string, stage: string): string {
  const id = `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const list = loadConversations();
  list.unshift({
    id,
    title: title.trim().slice(0, 80) || 'New Research',
    stage,
    updatedAt: nowIso(),
    pinned: false,
    messages: [],
  });
  saveConversations(list);
  return id;
}

/** List history items sorted by pinned first, then updatedAt desc. */
export function listLocalHistory(): HistoryItem[] {
  return loadConversations()
    .map(toHistoryItem)
    .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.updatedAt.localeCompare(a.updatedAt));
}

/** Append a message to a conversation and refresh its updatedAt. */
export function appendLocalMessage(id: string, role: StoredMessage['role'], content: string): void {
  if (!content.trim()) return;
  const list = loadConversations();
  const conv = list.find((item) => item.id === id);
  if (!conv) return;
  conv.messages.push({ role, content });
  if (conv.messages.length > MAX_MESSAGES_PER_CONVERSATION) {
    conv.messages = conv.messages.slice(-MAX_MESSAGES_PER_CONVERSATION);
  }
  conv.updatedAt = nowIso();
  saveConversations(list);
}

/** Load the stored messages of a conversation. */
export function getLocalMessages(id: string): StoredMessage[] {
  const conv = loadConversations().find((item) => item.id === id);
  return conv?.messages ?? [];
}

/** Update title and/or pinned flag of a conversation. */
export function patchLocalConversation(id: string, patch: { title?: string; pinned?: boolean }): void {
  const list = loadConversations();
  const conv = list.find((item) => item.id === id);
  if (!conv) return;
  if (typeof patch.title === 'string' && patch.title.trim()) conv.title = patch.title.trim().slice(0, 80);
  if (typeof patch.pinned === 'boolean') conv.pinned = patch.pinned;
  conv.updatedAt = nowIso();
  saveConversations(list);
}

/** Delete a conversation together with its research-state snapshot. */
export function deleteLocalConversation(id: string): void {
  saveConversations(loadConversations().filter((item) => item.id !== id));
  try {
    window.localStorage.removeItem(`clinical-research-state:${id}`);
  } catch {
    // ignore
  }
}

/** List favorite papers stored in the browser. */
export function listLocalLibrary(): Paper[] {
  const list = readJson<Paper[]>(LIBRARY_KEY, []);
  return Array.isArray(list) ? list : [];
}

/** Add a paper to the local library; returns the updated list. */
export function addLocalFavorite(paper: Paper): Paper[] {
  const list = listLocalLibrary();
  if (list.some((item) => item.id === paper.id)) return list;
  const next = [{ ...paper, favorite: true }, ...list];
  writeJson(LIBRARY_KEY, next);
  return next;
}

/** Remove a paper from the local library; returns the updated list. */
export function removeLocalFavorite(id: string): Paper[] {
  const next = listLocalLibrary().filter((item) => item.id !== id);
  writeJson(LIBRARY_KEY, next);
  return next;
}
