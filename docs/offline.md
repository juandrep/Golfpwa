# Offline strategy

- App shell is precached via `vite-plugin-pwa` Workbox integration.
- User data is stored in IndexedDB (Dexie): courses, rounds, settings, active round.
- A built-in 18-hole demo course is seeded on first run.
- Last used round is persisted via `activeRound` table for resume after refresh.
- OSM tile requests are runtime cached using CacheFirst with bounded size:
  - cache name: `osm-tiles`
  - max entries: 600
  - max age: 7 days
- If GPS is denied/unavailable, the map screen shows an explicit error state.
