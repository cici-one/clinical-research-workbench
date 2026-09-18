# Clinical Research Workbench

An independent, local-first workspace for exploring medical literature, analyzing research hotspots, refining research questions, and reviewing academic drafts.

## Highlights

- Search PubMed with year and journal-metric filters.
- Optionally search Web of Science with your own API key.
- Analyze trends and hotspots from retrieved literature.
- Discuss selected papers with an OpenAI-compatible language model.
- Upload PDF, DOCX, PPTX, XLSX, CSV, text, and image files for analysis.
- Save conversations and favorite papers in the browser without an account.
- Use a responsive three-panel interface with a guided demo.

## Tech stack

- Next.js 16 and React 19
- TypeScript
- Tailwind CSS 4
- OpenAI-compatible Chat Completions API
- NCBI E-utilities for PubMed
- Optional Web of Science Starter API

## Getting started

Requirements: Node.js 20.9 or newer and pnpm 9 or newer.

```bash
git clone https://github.com/cici-one/clinical-research-workbench.git
cd clinical-research-workbench
pnpm install
cp .env.example .env.local
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Configuration

Set at least `LLM_API_KEY` in `.env.local`. The model service must expose an OpenAI-compatible `/chat/completions` endpoint.

| Variable | Required | Purpose |
| --- | --- | --- |
| `LLM_API_KEY` | Yes | API key for the language-model provider |
| `LLM_BASE_URL` | No | Provider base URL; defaults to `https://api.openai.com/v1` |
| `LLM_MODEL` | No | Main discussion and analysis model |
| `LLM_FAST_MODEL` | No | Faster model for lightweight tasks |
| `LLM_VISION_MODEL` | No | Vision-capable model for image and scanned-document analysis |
| `NCBI_TOOL` | No | Application name sent to NCBI E-utilities |
| `NCBI_EMAIL` | No | Contact email sent to NCBI E-utilities |
| `NCBI_API_KEY` | No | NCBI API key for higher request limits |
| `WOS_API_KEY` | No | Enables Web of Science search |
| `WOS_API_BASE` | No | Overrides the Web of Science Starter API endpoint |
| `JOURNAL_METRICS_JSON` | No | JSON map of journal names to JIF/JCR metadata |

Example journal metadata:

```env
JOURNAL_METRICS_JSON={"The Lancet":{"jif":88.5,"jcr":"Q1"}}
```

Never commit `.env.local` or expose an API key in browser-side code. All model and database requests run through server routes.

## Commands

```bash
pnpm dev          # Start the development server
pnpm ts-check     # Run TypeScript checks
pnpm lint:build   # Run blocking lint checks
pnpm build        # Create a production build
pnpm start        # Start the production server
```

## Data and privacy

Conversation history and saved papers are stored in the current browser's `localStorage`. They are not synchronized across devices. Uploaded files are processed per request and are not persisted by the application.

Requests to configured model providers, PubMed, and Web of Science are subject to those services' own privacy policies. Do not upload sensitive clinical information unless your deployment and provider agreements permit it.

## Deployment

Deploy to any platform that supports Next.js server routes. Configure environment variables in the hosting dashboard instead of committing them to Git. PubMed works without an API key at standard NCBI rate limits; Web of Science remains disabled until `WOS_API_KEY` is present.

## Limitations

- AI output may be incomplete or inaccurate and is not medical advice.
- Journal metrics are only shown when you provide a trusted metadata map.
- Web of Science access depends on your Clarivate subscription and API entitlement.
- This project does not generate images; the vision model is used only to interpret uploaded images.

## License

MIT License. See [LICENSE](LICENSE).
