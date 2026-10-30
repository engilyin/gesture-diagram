# gesture-diagram

Browser-first placeholder for the gesture-first diagram editor (Iteration 1 foundation).

## What is implemented right now

- Editable canvas surface with pan and zoom.
- Stroke capture and basic gesture recognition:
  - closed stroke → rectangle
  - long straight stroke → connector-like line
- Simple selection state (newly recognized element is selected).
- Local-only behavior (no backend integration yet).

## Run locally

From this folder (`solutions/gesture-diagram`):

```bash
npm install
npm run dev
```

Then open the local Vite URL shown in the terminal (usually `http://localhost:5173`).

## How to use the placeholder

- **Draw a shape:** click + drag on the canvas, then release.
- **Pan:** hold **Shift** while dragging (or middle mouse button drag).
- **Zoom:** mouse wheel, or use **Zoom In / Zoom Out** buttons.
- **Recognition result:** your stroke is converted to a basic element and rendered on the canvas.

## Verify current iteration status

```bash
npm test
npm run test:smoke
npm run build
npm run lint
```

The smoke suite (`npm run test:smoke`) covers the core demo flow: create a diagram element, save/load through browser storage, and import a Mermaid fixture.

## Collaboration adapter boundary (future-ready)

The editor remains local-first, but now exposes typed collaboration contracts for future host integrations:

- `src/editor/collaboration/adapter.ts` defines backend-agnostic adapter lifecycle and publish/apply boundaries.
- `src/editor/collaboration/events.ts` defines versioned collaboration events, including document change envelopes.
- `createDocumentChangeDispatcher()` in `src/editor/document.ts` provides subscribe/notify hooks for adapters without coupling UI or network concerns into the core editor model.

No live network synchronization is implemented in this iteration.
