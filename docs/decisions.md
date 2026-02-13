# Architecture decisions

## Defaults selected
- Stack: React + TypeScript + Vite + Tailwind + Zustand + Dexie + MapLibre.
- Open/free mapping only; no proprietary map keys.
- Bottom-tab mobile shell with shared UI primitives.
- IndexedDB is source of truth for all user data.
- Stableford toggle follows simple score delta rules with unit tests.

## Practical compromises in this environment
- NPM registry access is blocked in this execution environment, so dependencies cannot be installed or executed locally here.
- Implementation is completed in code, but runtime validation commands that require installed deps will fail until install is possible.
