# GreenCaddie

GreenCaddie is a mobile-first, offline-first golf GPS + scorecard PWA built with free/open-source services only.

## Stack
- React + TypeScript + Vite
- Tailwind CSS
- Zustand
- Dexie (IndexedDB)
- Firebase Authentication (Google Sign-In)
- Express API + MongoDB (cloud sync + leaderboard)
- MapLibre GL JS + selectable tile sources (Esri, OSM HOT, Carto)
- Vite PWA plugin (Workbox)

## Features
- Courses:
  - built-in 18-hole demo course
  - create course with manual base coordinates
- Round + scorecard:
  - start/resume active round
  - per-hole stroke entry
  - Stableford toggle
- Map mode:
  - geolocation tracking
  - distances to green front/middle/back
  - tap-to-measure distance
  - hazard distance readout
- History + stats:
  - past rounds list
  - avg score, putts/round, GIR%, FIR%, penalty trend
- Auth + sync:
  - Google sign-in with Firebase
  - user profile persisted in MongoDB
  - rounds/courses/settings synced to MongoDB per user
  - global leaderboard fed from synced data
- Settings:
  - meters/yards toggle
  - tile source switcher

## Docs
- `docs/decisions.md`
- `docs/offline.md`
- `docs/map.md`
- `docs/runbook.md`
- `docs/roadmap.md`

## Local development
1. `npm install`
2. Copy `.env.example` to `.env` and set Firebase (client + admin) + MongoDB values
3. `npm run server` (API at `http://localhost:3001`)
4. `npm run dev` (frontend at `http://localhost:5173`)
5. `npm test`
6. `npm run build`

## Vercel deployment
1. Import this repo in Vercel.
2. Add env vars from `.env.example` in the Vercel project settings.
3. Keep `VITE_API_BASE_URL=/api` (or leave it unset to use the default `/api`).
4. Deploy.

This repo includes Vercel API functions under `api/` and SPA route fallback in `vercel.json`, so frontend routes and `/api/*` both work in production.

## Offline test
Follow `docs/runbook.md` → Offline verification section.
