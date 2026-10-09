import { defineConfig } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import react from '@vitejs/plugin-react-swc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig(({ mode }) => {
  const isLibrary = mode === 'library';

  if (isLibrary) {
    // Library mode - builds only library code, without the dev preview
    return {
      plugins: [react()],
      build: {
        lib: {
          entry: {
            index: resolve(__dirname, 'src/index.ts'),
            'html-editor': resolve(__dirname, 'src/html-editor.ts'),
          },
          name: 'EmailBuilder',
          formats: ['es'],
        },
        // minify: 'terser',
        // terserOptions: {
        //   compress: {
        //     drop_console: true,
        //     drop_debugger: true,
        //     pure_funcs: ['console.log', 'console.info', 'console.debug'],
        //   },
        // },
        minify: 'esbuild',
        // esbuild minification settings
        esbuild: {
          drop: ['console', 'debugger'],
        },
        // Enable code splitting (must be explicit in lib mode)
        cssCodeSplit: true,
        // Chunk size warning limit (KB)
        chunkSizeWarningLimit: 1000,
        rollupOptions: {
          external: (id) => {
            // Dependencies explicitly externalized (matched first)
            const explicitExternals = [
              'react',
              'react-dom',
              '@mui/material',
              '@mui/icons-material',
              '@emotion/react',
              '@emotion/styled',
              'react-syntax-highlighter',
            ];

            // Check against the explicit list
            if (explicitExternals.some(dep => id === dep || id.startsWith(`${dep}/`))) {
              return true;
            }

            // Externalize everything in node_modules (except the explicit exclusions)
            if (!id.startsWith('.') && !id.startsWith('/') && !id.includes('src/')) {
              return true;
            }

            return false;
          },
          output: {
            globals: {
              react: 'React',
              'react-dom': 'ReactDOM',
            },
            // Code splitting: put independent modules in separate chunks to keep files small
            // Note: avoid over-splitting (circular deps); only split truly independent large modules
            manualChunks: (id) => {
              // 1. CodeMirror deps (large, only used by HtmlEditor, fully independent)
              if (
                id.includes('@uiw/react-codemirror') ||
                id.includes('@codemirror/') ||
                id.includes('@uiw/codemirror-themes-all')
              ) {
                return 'codemirror';
              }

              // 2. Sample templates (loaded on demand, fully independent)
              if (id.includes('getConfiguration/sample/')) {
                return 'samples';
              }

              // Note: other modules (blocks, helpers, App components, etc.) stay in the main bundle
              // because they depend on each other and splitting would create circular deps
              // This keeps files small while avoiding circular dependencies
            },
            // Chunk file naming
            chunkFileNames: (chunkInfo) => {
              // Different naming rules per chunk
              const facadeModuleId = chunkInfo.facadeModuleId
                ? chunkInfo.facadeModuleId.split('/').pop()?.replace(/\.[^/.]+$/, '')
                : 'chunk';
              return `chunks/${facadeModuleId || 'chunk'}-[hash].js`;
            },
            // Entry file naming
            entryFileNames: (chunkInfo) => {
              // Main entry stays index.js; the html-editor entry uses html-editor.js
              if (chunkInfo.name === 'html-editor') {
                return 'html-editor.js';
              }
              return 'index.js';
            },
          },
        },
      },
    };
  }

  // Dev/preview mode - uses the docs folder as the preview app
  return {
    plugins: [react()],
    root: resolve(__dirname, 'docs'),
    // Base path can be set via env var (for GitHub Pages)
    base: process.env.VITE_BASE_PATH || '/',
    resolve: {
      alias: {
        // Use local source for debugging
        // 'monto-email-block-socials': resolve(__dirname, 'monto-email-block-socials/src'),
        // 'monto-email-core': resolve(__dirname, 'monto-email-core/src'),
        // 'monto-email-block-text': resolve(__dirname, 'monto-email-block-text/src'),
        // 'monto-email-block-button': resolve(__dirname, 'block-button/src'),
        // 'monto-email-block-heading': resolve(__dirname, 'block-heading/src'),
        // 'monto-email-block-columns-container': resolve(__dirname, 'block-columns-container/src'),
      },
    },
    build: {
      outDir: resolve(__dirname, 'docs-dist'),
      emptyOutDir: true,
    },
  };
});
