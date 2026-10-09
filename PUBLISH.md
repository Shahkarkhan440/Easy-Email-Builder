# Publishing to npm

## 1. Build

```bash
npm run build:lib
```

This builds the library into `dist/` and generates the `.d.ts` type definitions.

## 2. Test locally (optional)

```bash
npm pack
# In another project:
npm install /path/to/emailbuilder-pro-1.0.0.tgz
```

## 3. Log in and publish

```bash
npm login
npm publish --access public
```

## Releasing a new version

```bash
npm version patch   # 1.0.0 -> 1.0.1
npm version minor   # 1.0.0 -> 1.1.0
npm version major   # 1.0.0 -> 2.0.0

npm run build:lib
npm publish --access public
```

For a beta release:

```bash
npm version 1.0.1-beta.1
npm publish --tag beta
```

## Notes

- Follow semantic versioning.
- `peerDependencies` (react, react-dom, MUI, emotion) are installed by the consumer.
- `.npmignore` keeps the published package small.
- `npm unpublish` only works within 72 hours of publishing.
