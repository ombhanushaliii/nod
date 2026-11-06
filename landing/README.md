# Nod — landing page

The marketing site for Nod, built with React + TypeScript + Vite from the `Nod Landing` design.

## Run it

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

The build goes to `dist/`, a static site you can host anywhere.

## Deploy (Cloudflare Pages)

It's served at https://getnod.pages.dev from the Cloudflare Pages project `getnod` (set in `wrangler.toml`). Cloudflare also builds and deploys every new commit by itself.

```bash
npx wrangler login   # once
npm run deploy       # builds, then uploads dist/
```

`public/_headers` sets caching: files in `/assets` are cached for a year, `index.html` isn't.

## Where things are

| Path | What |
| --- | --- |
| `src/Landing.tsx` | The whole page: header, hero with the two phones, how it works, what Nod checks, the three questions, for trustees, download, footer |
| `src/index.css` | Page basics and the hover colours for buttons |
| `public/assets/nod-logo.png` | The Nod logo (header, download card, footer, favicon) |

The two interactive bits work like the design: tap **Allow once** or **Deny & report** on the trustee's phone in the hero, and pick a payment under **What Nod checks** to see what happens to it.

## The invite page (`/invite`)

Trustee invite emails link to `/invite?token=...` (`src/Invite.tsx`). The page:

- Asks the API whether the link is still open (`GET /public/invites/:token`). That needs `VITE_API_URL` at build time. Production builds take it from `.env.production`; see `.env.example` for local runs. Without it, the page skips the check.
- Explains what a trustee does, then opens the app at `nod://trustee/invite?token=...`.
- Never shows who sent the invite. `public/_headers` stops the token from leaking as a referrer, and keeps the page out of caches and search results.
