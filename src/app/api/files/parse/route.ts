import { NextRequest, NextResponse } from 'next/server';
import { parseFile } from '@/lib/file-parser';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const files = form.getAll('files').filter((item): item is File => item instanceof File);
  if (!files.length) {
    return NextResponse.json({ error: 'No files received' }, { status: 400 });
  }

  const results = [];

  for (const file of files) {
    try {
      const parsed = await parseFile({
        name: file.name,
        type: file.type,
        arrayBuffer: () => file.arrayBuffer(),
      });

      results.push({
        name: parsed.name,
        type: parsed.type,
        size: parsed.size,
        parsedText: parsed.parsedText,
        parseMethod: parsed.parseMethod,
        meta: parsed.meta,
      });
    } catch (error) {
      console.error('[Files] Parsing failed:', file.name, error);
      results.push({
        name: file.name,
        type: file.type || 'unknown',
        size: file.size,
        parsedText: `File parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        parseMethod: 'fallback',
      });
    }
  }

  return NextResponse.json({ files: results });
}
