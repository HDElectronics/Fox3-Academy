# Deployment

The public site, **https://fox3-academy.pages.dev**, is the code-split web build (`npm run build:web`,
output `dist-web/`) hosted on **Cloudflare Pages** through its GitHub integration. Cloudflare builds and publishes every push to `main`;
pull requests get their own preview URL. There is no deploy workflow, token or account detail in this
repository.

## What the repository provides

| File | Purpose |
|---|---|
| `.node-version` | Node 24 for the Cloudflare build, the same as CI. |
| `public/_headers` | Response headers: Content-Security-Policy, `nosniff`, referrer and permissions policies, and one-year immutable caching for the content-hashed files in `assets/`. |
| `public/favicon.svg` | Site icon. |
| `index.html` | Title, description and Open Graph tags for link previews. `og:url` and `og:image` hold the absolute site address: update them if the domain changes. |
| `public/og.png` | 1200 × 630 link-preview image (a crop of `docs/images/tws.png`). |

The app is a static site. The hash router (`#/tws`) and `base: './'` mean it needs no rewrite rules
and works at any path.

Nothing loads from another origin: scripts, styles, 3D models and fonts are all served by the site
(`src/styles/fonts.css` self-hosts the four families). That is what lets the CSP stay at `'self'`. If a
feature ever needs another origin, add it to the CSP in `public/_headers` deliberately.

## One-time setup (project owner)

1. In the Cloudflare dashboard: **Workers & Pages → Create**, then the **"Looking to deploy Pages?"** link at
   the bottom (the default form is for Workers and asks for a deploy command and an API token, which Pages
   does not need), **Import an existing Git repository**, and authorise the Cloudflare GitHub app for this
   repository only.
2. Build settings:
   - Production branch: `main`
   - Framework preset: None
   - Build command: `npm run build:web`
   - Build output directory: `dist-web`
3. Save and deploy. The site appears at `https://<project-name>.pages.dev`.
4. Optional: add a custom domain under the project's **Custom domains** tab.
5. Recommended: under **Settings → Builds**, set preview deployments for pull requests from forks to require
   approval, so outside contributions do not build automatically.

## Before each release

- `npm run check` is green (CI runs the same on every pull request).
- Visual checks from `AGENTS.md` for the pages that changed.
- Optional local run with production headers: `npm run build:web`, then
  `npx wrangler pages dev dist-web`, and open the printed URL. The browser console shows any CSP violation.

## Rollback

In the Pages project, **Deployments** lists every build; choose an earlier one and **Rollback**. Reverting
the commit on `main` also redeploys.
