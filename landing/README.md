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

It's served at https://getnod.pages.dev from the Cloudflare Pages project `getnod`, which is connected to this GitHub repo:

- **Every push to `main`** builds and deploys it (root directory `landing`, `npm run build`, output `dist`, `NODE_VERSION=24`).
- **Every pull request** gets its own preview link from Cloudflare.

To deploy by hand from your machine instead:

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
