# Runbook

## Development
1. `npm install`
2. `npm run dev`

## Production build
1. `npm run build`
2. `npm run preview`

## Smoke check
- Build must complete: `npm run build`
- Unit tests: `npm test`

## Offline verification
1. Open app once online.
2. Start a round and enter scores.
3. Reload and verify round resumes.
4. Turn network offline in browser devtools.
5. Verify history, settings, and seeded course still render.
