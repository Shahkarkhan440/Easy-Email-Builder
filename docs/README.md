# Development preview

This folder holds the local preview app. It is not part of the npm package.

- `main.tsx` - preview entry point
- `index.html` - preview HTML
- `favicon/` - site icons

```bash
npm run dev     # start the dev server
npm run build   # build the preview into docs-dist/
```

Library code lives in `src/` and is built with `npm run build:lib`.
