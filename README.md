# GreenCaddie

GreenCaddie is a mobile-first, offline-first golf GPS + scorecard PWA built with free/open-source services only.

## Stack
- React + TypeScript + Vite
- Tailwind CSS
- Zustand
- Dexie (IndexedDB)
- MapLibre GL JS + OSM tile sources
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
- Settings:
  - meters/yards toggle
  - tile source switcher

## Docs
- `docs/decisions.md`
- `docs/offline.md`
- `docs/map.md`
- `docs/runbook.md`
- `docs/roadmap.md`

## Commands
1. `npm install`
2. `npm run dev`
3. `npm test`
4. `npm run build`

## Offline test
Follow `docs/runbook.md` → Offline verification section.
