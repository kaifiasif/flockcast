# Web app conventions

React 19 + TypeScript + Tailwind v4 + shadcn/ui (Radix), restyled to the Charm design language. Hash routes, TanStack Query, and Hono's typed client against the server's own routes.

## Structure

```
src/
  app/            router (hash routes), providers, app.tsx (public landing, auth, signed-in shell)
  api/            typed client (Hono RPC), ApiError, query client and keys, shared types
  components/
    ui/           shadcn/ui components, restyled to Charm (pill buttons and inputs, 24px cards)
    brand/        Logo, LogoMark, Pip (the mascot) and its sticker art
    layout/       app shell (top bar, nav, account menu)
    shared/       Page/PageHeader, EmptyState, QueryView, a safe Markdown renderer
  features/<name>/
    api.ts        the feature's TanStack Query hooks; the only place it talks to the server
    *-page.tsx    one screen, rendered by app/app.tsx
    components/   pieces used only by this feature
  lib/            pure helpers: format, utils
scripts/          stickers.ts (writes the Pip sticker SVGs)
```

## Rules

- **Types come from the server.** Use `@/api/types`. Never redeclare a response shape and never use `any`.
- **Data access only through a feature's `api.ts` hooks.** Components never call `fetch` or the client directly. Mutations invalidate through the query keys in `@/api/query-client`.
- **Server errors are `ApiError`** with a stable `code`. Branch on `code`, show `message`: a toast for failed actions, `QueryView` for failed loads.
- **shadcn first.** Build from `@/components/ui/*`. Add a missing primitive by vendoring it from shadcn and restyling it, not by writing a lookalike.
- **Small components.** One component per concern; a file over ~200 lines is a sign to split it.
- **Copy:** sentence case, plain verbs, a button says what it does ("Start rehearsal", not "Submit"). Simulated audiences are a rehearsal, not a forecast; copy never promises reach. Plurals are always correct (`verbPlural` and friends in `@/lib/format`).
- **Accessibility:** every icon-only button has an `aria-label`; keyboard focus is always visible; layouts work at 375px wide.
- **Colour:** Charm tokens in `src/index.css`. Warm stone surfaces, coral brand (`#E4544B`, text `#C9443A`), light theme only (`dark:` utilities never apply). Coral marks pushback and primary actions; don't add new saturated colours.
- **Type:** Inter for text, DM Sans bold and tight for headings, Fragment Mono for small labels. All self-hosted through @fontsource; nothing is inlined as a data URL, so the CSP stays strict.
- **Pip** is the mascot: use `<Pip variant=...>` for followers, empty states and errors. Its art is static (`pip-art.ts`); never feed user or server data into it.
- **Motion** lives in `index.css` (`arrive`, `shimmer`, `pushback`, tab glide). One orchestrated moment per screen at most; `prefers-reduced-motion` skips every animation to its last frame.
- **Ship the build.** After a web change, run `npm run build` here so `../public` matches the source.
