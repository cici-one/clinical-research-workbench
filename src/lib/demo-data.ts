import type { Paper } from '@/types';

export interface DemoHotspotData {
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
}

export const DEMO_SEARCH_QUERY =
  '("Breast Neoplasms"[MeSH Terms] OR "triple-negative breast cancer"[Title/Abstract]) AND (neoadjuvant[Title/Abstract]) AND (immunotherapy[Title/Abstract] OR pembrolizumab[Title/Abstract] OR atezolizumab[Title/Abstract])';

export const DEMO_SEARCH_TERMS =
  'triple-negative breast cancer; neoadjuvant immunotherapy; biomarkers';

export const DEMO_PAPERS: Paper[] = [
  {
    id: 'demo-keynote-522-primary',
    pmid: '32101663',
    title: 'Pembrolizumab for Early Triple-Negative Breast Cancer',
    titleZh: '帕博利珠单抗用于早期三阴性乳腺癌',
    authors: 'Schmid P, Cortes J, Pusztai L, et al.',
    journal: 'The New England Journal of Medicine',
    year: 2020,
    jif: 96.2,
    jcr: 'Q1',
    type: 'Randomized Controlled Trial',
    abstract: 'A phase 3 trial evaluating neoadjuvant pembrolizumab plus chemotherapy followed by adjuvant pembrolizumab in patients with early triple-negative breast cancer.',
    source: 'PubMed',
    doi: '10.1056/NEJMoa1910549',
    url: 'https://pubmed.ncbi.nlm.nih.gov/32101663/',
  },
  {
    id: 'demo-keynote-522-efs',
    pmid: '35139274',
    title: 'Event-free Survival with Pembrolizumab in Early Triple-Negative Breast Cancer',
    titleZh: '帕博利珠单抗治疗早期三阴性乳腺癌的无事件生存期',
    authors: 'Schmid P, Cortes J, Dent R, et al.',
    journal: 'The New England Journal of Medicine',
    year: 2022,
    jif: 96.2,
    jcr: 'Q1',
    type: 'Randomized Controlled Trial',
    abstract: 'Follow-up from KEYNOTE-522 reporting event-free survival outcomes for perioperative pembrolizumab combined with chemotherapy.',
    source: 'PubMed',
    doi: '10.1056/NEJMoa2112651',
    url: 'https://pubmed.ncbi.nlm.nih.gov/35139274/',
  },
  {
    id: 'demo-keynote-522-os',
    pmid: '39282906',
    title: 'Overall Survival with Pembrolizumab in Early-Stage Triple-Negative Breast Cancer',
    titleZh: '帕博利珠单抗治疗早期三阴性乳腺癌的总生存期',
    authors: 'Schmid P, Cortes J, Dent R, et al.',
    journal: 'The New England Journal of Medicine',
    year: 2024,
    jif: 96.2,
    jcr: 'Q1',
    type: 'Randomized Controlled Trial',
    abstract: 'Overall-survival analysis of perioperative pembrolizumab plus chemotherapy for early-stage triple-negative breast cancer.',
    source: 'PubMed',
    doi: '10.1056/NEJMoa2409932',
    url: 'https://pubmed.ncbi.nlm.nih.gov/39282906/',
  },
  {
    id: 'demo-impassion031',
    pmid: '32966830',
    title: 'Neoadjuvant atezolizumab in combination with sequential nab-paclitaxel and anthracycline-based chemotherapy versus placebo and chemotherapy in patients with early-stage triple-negative breast cancer (IMpassion031)',
    titleZh: 'IMpassion031：阿替利珠单抗联合新辅助化疗治疗早期三阴性乳腺癌',
    authors: 'Mittendorf EA, Zhang H, Barrios CH, et al.',
    journal: 'The Lancet',
    year: 2020,
    jif: 88.5,
    jcr: 'Q1',
    type: 'Randomized Controlled Trial',
    abstract: 'A phase 3 trial evaluating atezolizumab combined with neoadjuvant chemotherapy in early-stage triple-negative breast cancer.',
    source: 'PubMed',
    doi: '10.1016/S0140-6736(20)31953-X',
    url: 'https://pubmed.ncbi.nlm.nih.gov/32966830/',
  },
  {
    id: 'demo-geparnuevo',
    pmid: '35525007',
    title: 'Neoadjuvant durvalumab improves survival in early triple-negative breast cancer independent of pathological complete response',
    titleZh: '新辅助度伐利尤单抗改善早期三阴性乳腺癌生存结局',
    authors: 'Loibl S, Schneeweiss A, Huober JB, et al.',
    journal: 'Annals of Oncology',
    year: 2022,
    jif: 56.7,
    jcr: 'Q1',
    type: 'Clinical Trial Follow-up',
    abstract: 'Survival follow-up from the GeparNuevo study examining neoadjuvant durvalumab in early triple-negative breast cancer.',
    source: 'PubMed',
    url: 'https://pubmed.ncbi.nlm.nih.gov/35525007/',
  },
  {
    id: 'demo-pdl1-assays',
    pmid: '',
    title: 'PD-L1 assessment in breast cancer: assay selection, scoring systems, and clinical interpretation',
    titleZh: '乳腺癌 PD-L1 评估：检测平台、评分体系与临床解释',
    authors: 'Demo evidence synthesis record',
    journal: 'The Breast',
    year: 2024,
    jif: 3.9,
    jcr: 'Q1',
    type: 'Review',
    abstract: 'A demonstration record summarizing how antibody clones, immune-cell scoring, combined positive score, specimen type, and cutoffs can affect PD-L1 interpretation.',
    source: 'PubMed',
  },
  {
    id: 'demo-til-biomarker',
    pmid: '',
    title: 'Tumor-infiltrating lymphocytes as biomarkers in early triple-negative breast cancer',
    titleZh: '肿瘤浸润淋巴细胞作为早期三阴性乳腺癌生物标志物',
    authors: 'Demo evidence synthesis record',
    journal: 'Breast Cancer Research',
    year: 2023,
    jif: 7.4,
    jcr: 'Q1',
    type: 'Systematic Review',
    abstract: 'A demonstration synthesis record covering prognostic and predictive roles of tumor-infiltrating lymphocytes in early triple-negative breast cancer.',
    source: 'PubMed',
  },
  {
    id: 'demo-biomarker-review',
    pmid: '',
    title: 'Biomarkers for neoadjuvant immunotherapy in triple-negative breast cancer',
    titleZh: '三阴性乳腺癌新辅助免疫治疗的生物标志物',
    authors: 'Demo evidence synthesis record',
    journal: 'Cancer Treatment Reviews',
    year: 2025,
    jif: 11.8,
    jcr: 'Q1',
    type: 'Review',
    abstract: 'A demonstration synthesis record comparing PD-L1, tumor-infiltrating lymphocytes, tumor mutational burden, immune signatures, and circulating biomarkers.',
    source: 'PubMed',
  },
];

export const DEMO_HOTSPOTS: DemoHotspotData = {
  hotspots: [
    {
      name: 'Predictive biomarkers for neoadjuvant immunotherapy',
      score: 92,
      reason: 'Studies increasingly compare PD-L1, TILs, immune signatures, and dynamic response markers to identify patients most likely to benefit.',
      literatureScale: 86,
      yearlyGrowth: 28,
      recentActivity: 94,
      cooccurrence: 89,
      supportPmids: ['32101663', '35139274', '39282906'],
      confidence: 'high',
      evidenceCoverage: 88,
      directionMatch: 96,
    },
    {
      name: 'Long-term benefit beyond pathological complete response',
      score: 86,
      reason: 'Event-free and overall-survival follow-up is shifting attention from short-term pCR gains to durable patient benefit.',
      literatureScale: 71,
      yearlyGrowth: 21,
      recentActivity: 90,
      cooccurrence: 76,
      supportPmids: ['35139274', '39282906', '35525007'],
      confidence: 'high',
      evidenceCoverage: 82,
      directionMatch: 89,
    },
    {
      name: 'Harmonization of PD-L1 assays and scoring',
      score: 81,
      reason: 'Differences in antibody clones, scoring algorithms, tissue timing, and positivity thresholds limit cross-study comparability.',
      literatureScale: 59,
      yearlyGrowth: 18,
      recentActivity: 84,
      cooccurrence: 81,
      confidence: 'medium',
      evidenceCoverage: 74,
      directionMatch: 93,
    },
  ],
  stats: {
    total: DEMO_PAPERS.length,
    searchTotal: 286,
    selectedDirectionCount: 4,
    yearDistribution: [
      { year: 2020, count: 2 },
      { year: 2022, count: 2 },
      { year: 2023, count: 1 },
      { year: 2024, count: 2 },
      { year: 2025, count: 1 },
    ],
    topKeywords: ['triple-negative breast cancer', 'neoadjuvant', 'immunotherapy', 'PD-L1', 'TILs', 'pCR', 'event-free survival'],
  },
  analysisScope: { fieldSample: DEMO_PAPERS.length, selectedDirection: 4, pubmedTotal: 286 },
};

export const DEMO_PAPER_INSIGHT = `Study role
This landmark randomized trial establishes the efficacy signal for adding pembrolizumab to neoadjuvant chemotherapy in early triple-negative breast cancer.

How to read it
Focus on the enrolled population, treatment sequence, pathological complete response definition, event-free survival follow-up, and whether biomarker subgroups were prespecified.

Research implication
The study supports investigating who benefits most, but it does not make PD-L1 a definitive standalone selection marker. Cross-trial biomarker comparisons should account for assay, cutoff, specimen timing, and treatment-regimen differences.`;

export const DEMO_HOTSPOT_INSIGHT = `Why this is a hotspot
Neoadjuvant immunotherapy improves outcomes for some patients, while treatment cost and immune-related toxicity make patient selection clinically important.

Evidence pattern
PD-L1, tumor-infiltrating lymphocytes, immune-gene signatures, and early response indicators repeatedly appear across trials and translational studies. Their apparent value varies with assay platform, scoring method, cutoff, specimen timing, and treatment backbone.

Research opportunity
A useful project can compare biomarker definitions and validation methods across major trials, then identify which markers are ready for prospective validation rather than claiming that one marker is already definitive.`;

export const DEMO_TOPIC_REPLY = `Three directions are worth narrowing:

1. Compare the predictive value of PD-L1 and TILs for neoadjuvant immunotherapy response in early triple-negative breast cancer.
2. Examine whether biomarker value changes across pCR, event-free survival, and overall-survival endpoints.
3. Study how assay platform, scoring method, and specimen timing explain inconsistent PD-L1 findings.

Which is more feasible with the data and specimens available to you?`;

export const DEMO_NARROWING_REPLY = `Direction 1 can be narrowed by making four choices:

- Population: all early TNBC patients or a specific clinical-risk subgroup?
- Biomarkers: PD-L1 alone, TILs alone, or a combined model?
- Outcome: pCR as the primary endpoint, with event-free survival as follow-up?
- Study design: retrospective validation using archived tissue, or a prospective cohort?

A practical next question is: do you have pretreatment tissue with both PD-L1 scoring and TIL assessment?`;

export const DEMO_REVIEW_GUIDANCE_REPLY = `A strong review should be organized around an argument rather than a list of studies:

1. Clinical need and why treatment-response prediction matters.
2. Evidence for PD-L1, including assay and scoring differences.
3. Evidence for TILs and immune-microenvironment markers.
4. Comparison of predictive performance across endpoints and regimens.
5. Sources of inconsistency and limitations in current validation.
6. A research agenda for standardized, prospective biomarker studies.

Use evidence tables to compare population, regimen, assay, cutoff, endpoint, effect direction, and limitations.`;

export const DEMO_REVIEW_FEEDBACK_REPLY = `The draft has a clear topic, but the evidence synthesis is still too shallow.

- It lists KEYNOTE-522 and IMpassion031 sequentially without comparing populations, treatment backbones, endpoints, or biomarker methods.
- The PD-L1 controversy is asserted but not supported with assay clone, scoring system, cutoff, or specimen-timing details.
- TMB and TILs are mentioned without explaining the strength or limitations of their evidence.
- The conclusion is generic and does not identify a specific research gap.

Revise around comparison questions, add an evidence table, and end each section with what is consistent, what conflicts, and what still requires validation.`;

export const DEMO_SYNTHESIS_REPLY = `Instead of describing the trials one after another, organize the paragraph around the comparison:

- Shared finding: both trials support adding checkpoint inhibition to neoadjuvant chemotherapy in early TNBC.
- Key difference: they evaluated different agents and chemotherapy backbones, so response estimates should not be compared as if the protocols were identical.
- Biomarker issue: benefit was not confined cleanly to a single PD-L1-defined group, while assay and scoring approaches differed.
- Interpretation: PD-L1 may describe immune context, but current cross-trial evidence does not justify using it alone to exclude patients.

This structure synthesizes agreement, heterogeneity, and the resulting research question without ghostwriting a full review section.`;

export const DEMO_SUPPLEMENTARY_SEARCH_REPLY = `Preset supplementary search loaded 8 representative records for this walkthrough.

Simulated PubMed query:
(PD-L1[Title/Abstract] OR "Programmed Cell Death Ligand 1"[MeSH Terms]) AND ("Breast Neoplasms"[MeSH Terms] OR "triple-negative breast cancer"[Title/Abstract]) AND (assay[Title/Abstract] OR scoring[Title/Abstract] OR cutoff[Title/Abstract] OR concordance[Title/Abstract])

The evidence should be grouped by antibody clone, scoring system, cutoff, specimen type, sampling time, treatment setting, and clinical endpoint. This is preset demo content; use Local Workspace for a live PubMed search.`;
