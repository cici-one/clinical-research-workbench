export interface SearchQueryFallback {
  query: string;
  summary: string;
}

const ACTION_WORDS =
  /please|could\s+you|would\s+you|search|look\s+up|find|retrieve|show\s+me|papers?|articles?|literature|evidence|research\s+progress|supporting\s+this\s+controversy|请|帮我|检索|搜索|查找|文献|证据|研究进展/gi;

export function buildFallbackMedicalQuery(message: string, historyText = ''): SearchQueryFallback {
  const cleaned = message
    .replace(ACTION_WORDS, ' ')
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
  const contextualText = `${message}\n${historyText}`;
  const concepts: Array<{ pattern: RegExp; query: string; label: string }> = [
    {
      pattern: /triple[-\s]?negative\s+breast\s+cancer|\bTNBC\b|三阴性乳腺癌/i,
      query: '("Triple Negative Breast Neoplasms"[MeSH Terms] OR "triple-negative breast cancer"[Title/Abstract] OR TNBC[Title/Abstract])',
      label: 'Triple-negative breast cancer',
    },
    {
      pattern: /breast\s+(cancer|carcinoma)|乳腺癌/i,
      query: '("Breast Neoplasms"[MeSH Terms] OR "breast cancer"[Title/Abstract] OR "breast carcinoma"[Title/Abstract])',
      label: 'Breast cancer',
    },
    {
      pattern: /PD[-\s]?L1|programmed\s+death[-\s]?ligand\s*1/i,
      query: '("Programmed Cell Death 1 Ligand 1 Protein"[MeSH Terms] OR PD-L1[Title/Abstract] OR PDL1[Title/Abstract])',
      label: 'PD-L1',
    },
    {
      pattern: /assay|scor(e|ing)|cut-?off|interpretation|concordance|检测|评分|阈值|判读|一致性/i,
      query: '(assay[Title/Abstract] OR scoring[Title/Abstract] OR cutoff[Title/Abstract] OR interpretation[Title/Abstract] OR concordance[Title/Abstract])',
      label: 'Assay and scoring differences',
    },
    {
      pattern: /neoadjuvant|新辅助/i,
      query: '("Neoadjuvant Therapy"[MeSH Terms] OR neoadjuvant[Title/Abstract])',
      label: 'Neoadjuvant therapy',
    },
    {
      pattern: /immunotherap|checkpoint\s+inhibitor|pembrolizumab|atezolizumab|免疫治疗|检查点抑制剂/i,
      query: '("Immune Checkpoint Inhibitors"[MeSH Terms] OR immunotherapy[Title/Abstract] OR pembrolizumab[Title/Abstract] OR atezolizumab[Title/Abstract])',
      label: 'Immune checkpoint therapy',
    },
    {
      pattern: /tumou?r[-\s]?infiltrating\s+lymphocyte|\bTILs?\b|肿瘤浸润淋巴细胞/i,
      query: '("Lymphocytes, Tumor-Infiltrating"[MeSH Terms] OR TIL[Title/Abstract] OR TILs[Title/Abstract])',
      label: 'Tumor-infiltrating lymphocytes',
    },
    {
      pattern: /biomarker|生物标志物/i,
      query: '("Biomarkers"[MeSH Terms] OR biomarker[Title/Abstract] OR biomarkers[Title/Abstract])',
      label: 'Biomarkers',
    },
    {
      pattern: /chronic\s+kidney\s+disease|\bCKD\b|慢性肾病|慢性肾脏病/i,
      query: '("Kidney Diseases, Chronic"[MeSH Terms] OR "chronic kidney disease"[Title/Abstract] OR CKD[Title/Abstract])',
      label: 'Chronic kidney disease',
    },
    {
      pattern: /SGLT2|钠.?葡萄糖协同转运蛋白.?2/i,
      query: '("Sodium-Glucose Transporter 2 Inhibitors"[MeSH Terms] OR "SGLT2 inhibitor"[Title/Abstract] OR "SGLT2 inhibitors"[Title/Abstract])',
      label: 'SGLT2 inhibitors',
    },
  ];

  const selected: Array<{ query: string; label: string }> = [];
  const hasTnbc = concepts[0].pattern.test(contextualText);
  for (const concept of concepts) {
    if (!concept.pattern.test(contextualText)) continue;
    if (hasTnbc && concept.label === 'Breast cancer') continue;
    if (!selected.some((item) => item.query === concept.query)) selected.push(concept);
  }

  if (selected.length) {
    return {
      query: selected.map((item) => item.query).join(' AND '),
      summary: selected.map((item) => item.label).join('; '),
    };
  }

  const concise = cleaned
    .replace(/^(your|the|this|that|my|our)\s+/i, '')
    .replace(/\b(mentioned|review|please|real|supporting|controversy)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return { query: concise || message.trim(), summary: concise || message.trim() };
}
