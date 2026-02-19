# Runbook

## Development
1. `npm install`
2. Set `.env` from `.env.example`
3. Set `VITE_ADMIN_EMAILS` in `.env` to the Google emails allowed to access `/admin`
4. Start API: `npm run server`
5. Start frontend: `npm run dev`

## Production build
1. `npm run build`
2. `npm run preview`

## Smoke check
- Build must complete: `npm run build`
- Unit tests: `npm test`
- Full quality gates (CI/local): `npm run quality:check`

## Admin mapping flow
1. Sign in with a Google account listed in `VITE_ADMIN_EMAILS`.
2. Open `Admin` from the header (`/admin`).
3. Pick course + hole.
4. Use `Edit Points` for tee and green front/middle/back.
5. Use `Edit Polygons` for fairway, green area, and hazard zones.
6. Click map (or use GPS button) to add coordinates.
7. Save with `Save Draft`, then `Publish` once QA shows no errors.
8. Use `Member Approvals` to approve pending members.
9. Review `Course Audit Trail` for who changed course mapping and when.

## Offline verification
1. Open app once online.
2. Start a round and enter scores.
3. Reload and verify round resumes.
4. Turn network offline in browser devtools.
5. Verify history, settings, and seeded course still render.
