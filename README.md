# Fractal Status - Frontend

Frontend for the Fractal Status monitoring application.

A Metro / Windows Phone-style status board. The backend models infrastructure
as a single recursive tree; that tree *is* the layout. Monitored things are
square tiles on a strict grid, coloured by status. Groups are "folders" (a 2x2
tile) coloured by the rolled-up status of everything inside. You drill into a
folder as a frosted-glass overlay, or long-press to "explode" it in place and
promote its contents up a level.

## Stack

- Vite + React + TypeScript
- [Lucide](https://lucide.dev) icons (names come from the config `display.icon`)

## Running

Requires the backend (see `../backend`) on `http://localhost:8080`.

```bash
npm install
npm run dev        # http://localhost:5173 (proxies /api -> backend)
```

Other scripts: `npm run build`, `npm run preview`, `npm run typecheck`.

- Dev proxy target: `VITE_PROXY_TARGET` (default `http://localhost:8080`).
- Built-and-served-elsewhere API base: `VITE_API_BASE`.

## Behaviour

- Polls `GET /api/tree/status` (5s) for the tree: each node's `display`
  (icon, per-state OKLCH `colors`) and `runtime` (state; entities also carry
  `checks` and a primary `metric {value,unit}`).
- **Tiles:** entities are 1x1 (icon, name, metric; "Slow"/"Down" for warn/crit);
  unexploded groups are 2x2 (icon, name, leaf count "9 all ok" / "2 of 12
  failing"). Status colour fills the tile.
- **Status language** is generic: ok / warn / crit / unknown (grey). Group status
  rolls up as the worst descendant (client-side, pluggable).
- **Open a folder:** click -> frosted overlay panel, laid out on the same grid,
  with a status-coloured frame and a trailing Explode tile. Nested folders stack;
  close via the scrim or Esc.
- **Explode:** long-press a folder (or its Explode tile) -> the folder becomes a
  1x1 remnant followed by its children, reflowed in place. Tap the remnant to
  collapse.
- **Auto-explode failing** (option, on by default): any group on a path to a
  warn/crit entity is exploded automatically so the fault surfaces at top level.
- **Live updates** only re-colour tiles; layout changes (explode/collapse/resize)
  animate via FLIP (honours `prefers-reduced-motion`).
- **Columns** auto-fit to the window width.
- **Right pane** (resizable): entity detail (checks + output) on top; controls
  below - Auto-explode toggle, Explode all / Collapse all, scheduler start/stop,
  reload.
- **Log panel** along the bottom (hideable): snapshot via `GET /api/logs` then
  the live SSE stream, filtered to the selected node's subtree.

## Layout

```
src/
  api/        types + fetch/SSE client (mirrors backend/API_SPEC.md)
  board/      geometry (skyline packer), layout, model (status/rollup/metric),
              colors (tile fill), useFlip (FLIP animation)
  hooks/      useStatusTree (polling), useLogs (snapshot + SSE), useMedia
  components/ Board, Tile, DetailPane, Controls, LogPanel, Icon
  App.tsx     shell: board + resizable right pane + bottom log
```
