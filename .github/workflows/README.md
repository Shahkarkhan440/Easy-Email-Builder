# GitHub Pages deployment

## Setup

1. **Enable GitHub Pages.** The workflow sets `enablement: true`, so Pages is enabled automatically. If that fails, go to Settings > Pages and set Source to "GitHub Actions".
2. **Base path.** By default the repo name is used as the base path (e.g. `/Easy-Email-Builder/`). To serve from `/`, set `VITE_BASE_PATH` in `.github/workflows/deploy-pages.yml`:
   ```yaml
   VITE_BASE_PATH: /
   ```
3. **Deploy.** Pushing to `main` or `master` deploys automatically. You can also run the workflow manually from the Actions tab.

## Notes

- Commit `pnpm-lock.yaml`.
- `tsconfig.json` and `docs/tsconfig.json` must not reference parent directories.
- The site is served at `https://<username>.github.io/<repo>/`.
- If you see "Get Pages site failed", check that the repo has Pages permissions or enable Pages manually.
