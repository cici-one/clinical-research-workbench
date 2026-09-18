# Project Guide

## Development

- Use pnpm for dependency management.
- Keep the application provider-neutral. Model integrations must use the adapter in `src/lib/ai-provider.ts`.
- Keep secrets in environment variables and never expose them to client components.
- Preserve the local-first behavior for conversations and saved papers.
- Keep user-facing text, documentation, comments, and identifiers in English.

## Verification

Run these commands before publishing changes:

```bash
pnpm ts-check
pnpm lint:build
pnpm build
```
