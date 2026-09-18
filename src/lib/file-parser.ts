import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import { invokeVisionModel, DEFAULT_MODEL } from './ai-provider';

export interface ParsedFile {
  name: string;
  type: string;
  size: number;
  parsedText: string;
  parseMethod: 'traditional' | 'multimodal' | 'combined' | 'fallback';
  meta?: Record<string, unknown>;
}

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp']);
const TEXT_TYPES = new Set(['text/plain', 'text/csv', 'text/markdown', 'application/json']);
const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
]);
const PPTX_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-powerpoint',
]);

function extOf(name: string): string {
  const idx = name.lastIndexOf('.');
  return idx >= 0 ? name.slice(idx + 1).toLowerCase() : '';
}

function bufferToDataUri(buffer: Buffer, type: string): string {
  return `data:${type || 'application/octet-stream'};base64,${buffer.toString('base64')}`;
}

function truncate(text: string, max = 30000): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + `\n\n…(content truncated, ${text.length} characters in total)`;
}

async function parseDocx(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value.trim();
}

async function parseXlsx(buffer: Buffer): Promise<string> {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const parts: string[] = [];
  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet);
    parts.push(`### Sheet: ${sheetName}\n${csv}`);
  }
  return parts.join('\n\n').trim();
}

async function parsePdf(buffer: Buffer): Promise<string> {
  try {
    const mod = await import('pdf-parse');
    const PdfParser = (mod as unknown as {
      PDFParse?: new () => { load: (b: Buffer) => Promise<void>; getText: () => Promise<string> };
    }).PDFParse;
    if (!PdfParser) {
      throw new Error('pdf-parse is unavailable');
    }
    const parser = new PdfParser();
    await parser.load(buffer);
    const text = await parser.getText();
    return String(text ?? '').trim();
  } catch (error) {
    console.warn('[Parse] PDF text extraction failed; vision fallback will be used:', error instanceof Error ? error.message : error);
    return '';
  }
}

function parseText(buffer: Buffer): string {
  return buffer.toString('utf-8').trim();
}

async function parseImage(buffer: Buffer, type: string, fileName: string): Promise<string> {
  const dataUri = bufferToDataUri(buffer, type || 'image/png');
  const prompt = `Analyze this image in detail (file name: ${fileName}). If it is a scanned document, screenshot, or chart, fully recognize and transcribe the text content, and describe the key data, structure, and conclusions. Output in clear paragraphs and bullet points without omitting important information.`;
  return invokeVisionModel(prompt, [dataUri], {
    model: DEFAULT_MODEL,
    temperature: 0.2,
  });
}

export async function parseFile(file: {
  name: string;
  type: string;
  arrayBuffer: () => Promise<ArrayBuffer>;
}): Promise<ParsedFile> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const type = (file.type || '').toLowerCase();
  const ext = extOf(file.name);

  if (IMAGE_TYPES.has(type) || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext)) {
    const text = await parseImage(buffer, type, file.name);
    return {
      name: file.name,
      type: type || 'image',
      size: buffer.length,
      parsedText: truncate(text),
      parseMethod: 'multimodal',
      meta: { model: DEFAULT_MODEL },
    };
  }

  if (TEXT_TYPES.has(type) || ['txt', 'csv', 'md', 'json', 'log'].includes(ext)) {
    const text = parseText(buffer);
    return {
      name: file.name,
      type: type || 'text/plain',
      size: buffer.length,
      parsedText: truncate(text),
      parseMethod: 'traditional',
    };
  }

  if (type === DOCX_TYPE || ext === 'docx') {
    const text = await parseDocx(buffer);
    return {
      name: file.name,
      type: type || DOCX_TYPE,
      size: buffer.length,
      parsedText: truncate(text),
      parseMethod: 'traditional',
    };
  }

  if (XLSX_TYPES.has(type) || ['xlsx', 'xls'].includes(ext)) {
    const text = await parseXlsx(buffer);
    return {
      name: file.name,
      type: type || 'spreadsheet',
      size: buffer.length,
      parsedText: truncate(text),
      parseMethod: 'traditional',
    };
  }

  if (PPTX_TYPES.has(type) || ['pptx', 'ppt'].includes(ext)) {
    let text = '';
    try {
      const AdmZip = (await import('adm-zip')).default;
      const zip = new AdmZip(buffer);
      const slideEntries = zip
        .getEntries()
        .filter((e) => /^ppt\/slides\/slide\d+\.xml$/.test(e.entryName))
        .sort((a, b) => a.entryName.localeCompare(b.entryName, undefined, { numeric: true }));
      const slides: string[] = [];
      for (const entry of slideEntries) {
        const xml = entry.getData().toString('utf-8');
        const texts = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]);
        if (texts.length) slides.push(`## ${entry.entryName.replace('ppt/slides/', '').replace('.xml', '')}\n${texts.join('\n')}`);
      }
      text = slides.join('\n\n').trim();
    } catch {
      text = '';
    }
    if (text.length > 50) {
      return {
        name: file.name,
        type: type || 'presentation',
        size: buffer.length,
        parsedText: truncate(text),
        parseMethod: 'traditional',
      };
    }
    return {
      name: file.name,
      type: type || 'presentation',
      size: buffer.length,
      parsedText: `[PPT file] ${file.name} (${(buffer.length / 1024).toFixed(1)} KB). Traditional parsing did not extract enough text; consider saving it as PDF or images and re-uploading for full parsing.`,
      parseMethod: 'fallback',
    };
  }

  if (type === 'application/pdf' || ext === 'pdf') {
    const text = await parsePdf(buffer);
    if (text.length > 50) {
      return {
        name: file.name,
        type: 'application/pdf',
        size: buffer.length,
        parsedText: truncate(text),
        parseMethod: 'traditional',
      };
    }
    const dataUri = bufferToDataUri(buffer, 'application/pdf');
    try {
      const visionText = await invokeVisionModel(
        `This is a scanned PDF (file name: ${file.name}, ${(buffer.length / 1024).toFixed(1)} KB). Please recognize and transcribe its text content as best as possible, preserving the original paragraphs. If the content is long, prioritize extracting the core content of the first few pages and note which parts were recognized.`,
        [dataUri],
        { model: DEFAULT_MODEL, temperature: 0.2 },
      );
      return {
        name: file.name,
        type: 'application/pdf',
        size: buffer.length,
        parsedText: truncate(visionText || text),
        parseMethod: 'multimodal',
        meta: { note: 'Scanned PDF, parsed with multimodal model' },
      };
    } catch (error) {
      return {
        name: file.name,
        type: 'application/pdf',
        size: buffer.length,
        parsedText: text || `[PDF file] ${file.name}: both traditional and multimodal parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        parseMethod: 'fallback',
      };
    }
  }

  return {
    name: file.name,
    type: type || 'unknown',
    size: buffer.length,
    parsedText: `[Unrecognized file type] ${file.name} (${type || ext || 'unknown'}). Please upload PDF, Word, Excel, PPT, TXT, CSV or images for full parsing.`,
    parseMethod: 'fallback',
  };
}
