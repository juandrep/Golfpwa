# Architecture decisions

## Defaults selected without blocking questions
- Project name: **GreenCaddie**.
- Bootstrapped a Vite + React + TypeScript project structure manually due package registry access restrictions in this environment.
- Domain-first structure added at `/src/domain` with pure functions and typed entities.
- Data layer uses Dexie/IndexedDB repositories in `/src/data`.
- Added a built-in 18-hole demo course to ensure immediate offline usability on first launch.

## Next implementation phases
- Add Tailwind design system + shared UI components.
- Add feature slices for courses, round, map, history, settings.
- Add PWA service worker + runtime map tile caching strategy.
