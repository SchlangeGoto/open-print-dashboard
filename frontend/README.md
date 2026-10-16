# OpenPrintDashboard - Frontend

The frontend is a [Next.js](https://nextjs.org) (App Router) app using
[TypeScript](https://www.typescriptlang.org/), [Tailwind CSS](https://tailwindcss.com),
and [shadcn/ui](https://ui.shadcn.com).

## Requirements

- Node.js 20.9+ and npm

## Quick Start

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. The app talks to the backend at `http://localhost:8000`
(override with `NEXT_PUBLIC_API_URL`).

## Structure

- `app/` — routes (`/`, `/setup`, `/dashboard/*`, `/recover-password`, `/reset-password`)
- `components/ui/` — shadcn/ui components, plus a few project helpers
  (`SpoolIndicator`, `CoverImage`, `StatCard`, `EmptyState`, `loading-button`)
- `components/layout/` — sidebar shell (`DashboardLayout`, `AppSidebar`, `UserMenu`)
  and `AuthLayout`
- `components/modals/` — dialog-based detail and edit modals
- `lib/api.ts` — typed fetch client for the `/api/v1` backend
- `lib/auth.tsx` — auth context (JWT in `localStorage`)
- `lib/utils.ts` — formatting helpers and `cn`

## shadcn/ui

Components are configured in `components.json`. Add more with:

```bash
npx shadcn@latest add <component>
```

Generated components import `cn` from the `cn` package and Radix primitives from
`radix-ui`. Shared primitives live in `components/ui` and can be customized there
(for example, the extra `success` / `warning` / `info` `Badge` variants).

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the development server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | Run ESLint |
