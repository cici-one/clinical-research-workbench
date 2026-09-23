export interface SearchQueryFallback {
  query: string;
  summary: string;
}

const PUBMED_FIELD_TAG = /\[(?:MeSH Terms|Title\/Abstract|Publication Type|Date - Publication)\]/i;

/**
 * Extract the user's current search term without borrowing concepts from chat
 * history or expanding it into a broader generated query.
 */
export function buildFallbackMedicalQuery(message: string): SearchQueryFallback {
  const original = message.trim();
  if (!original) return { query: '', summary: '' };

  // An explicitly edited PubMed expression is already the final query.
  if (PUBMED_FIELD_TAG.test(original)) {
    return { query: original, summary: original };
  }

  const keyword = original
    .replace(/[\u201c\u201d]/g, '"')
    .replace(
      /^\s*(?:(?:please|could\s+you|would\s+you)\s+)?(?:search(?:\s+for)?|look\s+up|find|retrieve|show\s+me)\s*/i,
      '',
    )
    .replace(/^\s*(?:papers?|articles?|literature|evidence)\s+(?:on|about|for)\s+/i, '')
    .replace(/^\s*(?:recent\s+)?research\s+progress\s+(?:on|about|for)\s+/i, '')
    .replace(/^\s*(?:on|about|for|regarding)\s+/i, '')
    .replace(/^\s*(?:\u8bf7|\u8bf7\u5e2e\u6211|\u5e2e\u6211)?(?:\u641c\u7d22|\u68c0\u7d22|\u67e5\u627e)\s*/i, '')
    .replace(/^\s*(?:\u5173\u4e8e|\u6709\u5173)\s*/i, '')
    .replace(/\s*(?:\u7684)?(?:\u8bba\u6587|\u6587\u732e|\u8bc1\u636e)\s*$/i, '')
    .replace(/^["']+|["']+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const query = keyword || original;
  return { query, summary: query };
}
