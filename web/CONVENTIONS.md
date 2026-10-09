# Web app conventions

The web app is React 19 + TypeScript + Tailwind v4 + shadcn/ui (new-york-v4, neutral theme), in the shadcn "dashboard" layout.

## Structure

```
src/
  app/            shell: router, providers, theme, global overlays (command menu, shortcuts), auth gate
  api/            typed client (Hono RPC from the server's own routes), errors, query client, inferred types
  components/
    ui/           shadcn/ui components, vendored unmodified from the shadcn repo
    layout/       sidebar, site header, Screen wrapper
    shared/       small app-wide pieces: StatusBadge, Page/PageHeader, QueryView, EmptyState, StatCard
  features/<name>/
    api.ts        the feature's TanStack Query hooks; the only place it talks to the server
    *-page.tsx    one screen, rendered by app/app.tsx
    components/   pieces used only by this feature
  hooks/          app-wide hooks (useHotkey, useIsMobile)
  lib/            pure helpers: format, labels, utils, storage
```

## Rules

- **Types come from the server.** Use the types in `@/api/types` (inferred from the routes). Never redeclare a response shape and never use `any`.
- **Data access only through a feature's `api.ts` hooks.** Components never call `fetch` or the client directly. Mutations invalidate through `queryKeys`.
- **Server errors are `ApiError`** with a stable `code`. Branch on `code`, show `message`. Use `toast.error(errorMessage(e))` for action failures and `QueryView` / `ErrorAlert` for load failures.
- **shadcn first.** Build from `@/components/ui/*`. Add a missing primitive by vendoring it from the shadcn repo, not by writing a lookalike.
- **Small components.** One component per concern; a file over ~200 lines is a sign to split it.
- **Labels in one place.** Every user-facing name for a server enum lives in `@/lib/labels`.
- **Copy:** sentence case, plain verbs, a button says what it does ("Accept draft", not "Submit"). No all-caps labels, no "A · B" meta strings, no arrows in button text. Plurals are always correct (`plural()` in `@/lib/format`).
- **Accessibility:** every icon-only button has an `aria-label`; keyboard focus is always visible; layouts work at 375px wide.
- **Colour**: ink and stone. Warm stone neutrals with ink (light) or bone (dark) as `primary`; no brand hue. The four proof colours are the only saturated colours and only mark check results. `--ember` is used for the fuse spark on hovered buttons and nothing else. Browser-drawn colour is themed too, so nothing falls back to the browser's blue: `::selection` is a stone tint, `color-scheme` and `accent-color` follow the app theme, and autofilled fields keep their own fill (`--autofill`) instead of the browser's grey-blue. Regression check: save a login in the browser, hover a suggestion and select text on Log in, Settings, Review and Drafts, in light and dark; no blue should appear.
- **Motion** lives in `index.css` (`motion-*`, `proof-*`, `lift`, `pencil-select`, `ink-sweep`, `thought-line`, `text-loop`, `lattice`, fuse and glide on button and tab slots) and in `components/shared/motion/` (`TextLoop`, `FolderFloat`, `CardStack`, `BubbleMenu`) plus `CountUp`, never as one-off styles in a component. Loops are allowed only for loading and waiting states and the archive shuffle, which pauses on hover; `prefers-reduced-motion` stops every loop and skips each animation to its last frame.
