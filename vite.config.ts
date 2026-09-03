import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import preact from '@preact/preset-vite';
import { defineConfig, type Plugin } from 'vite';

const NOTICES = 'THIRD-PARTY-NOTICES.md';

/**
 * Ships THIRD-PARTY-NOTICES.md with the site (docs/licensing.md, decision 4). The file is generated
 * and committed at the repository root by scripts/third-party-notices.mjs; the build copies it into
 * dist/ unchanged so the app shell can link it.
 */
function shipThirdPartyNotices(): Plugin {
  return {
    name: 'app-context-viewer:third-party-notices',
    apply: 'build',
    generateBundle() {
      let source: string;
      try {
        source = readFileSync(new URL(`./${NOTICES}`, import.meta.url), 'utf8');
      } catch {
        this.error(
          `${NOTICES} is missing; run \`node scripts/third-party-notices.mjs\` to generate it`,
        );
      }
      this.emitFile({ type: 'asset', fileName: NOTICES, source });
    },
  };
}

/**
 * ADR 0001, obligation 2: every chunk points at the notices file, and legal comments (`/*!`,
 * `@license`, `@preserve`) survive minification so a licence header inside a chunk, such as the
 * elk worker's, survives too. Vite 8 strips them from the main build unless `comments.legal` is set
 * explicitly (checked with a probe on 2026-09-02: only the worker build kept them by default), and
 * e2e/smoke.spec.ts asserts the served entry chunk still carries this banner.
 */
/**
 * Ships the fictitious AT&T-style Catalog with the site, so the hosted viewer can demonstrate the
 * case the sample Catalog cannot: an estate whose Applications are identified by APM number rather
 * than by a readable id (samples/att/README.md, docs/retrospective-2026-09-03.md). Reachable at
 * `?src=./catalog.att.json`.
 *
 * Only dist/ is served in production, so a Catalog that is not emitted here is not loadable there —
 * `?src=/samples/...` works against e2e/server.mjs locally and 404s on the deployed site.
 *
 * This is a fixture, not real data, and it carries that notice in its own `source` field.
 */
function shipDemoCatalogs(): Plugin {
  return {
    name: 'app-context-viewer:demo-catalogs',
    apply: 'build',
    generateBundle() {
      const from = new URL('./samples/att/catalog.att.json', import.meta.url);
      this.emitFile({
        type: 'asset',
        fileName: 'catalog.att.json',
        source: readFileSync(from, 'utf8'),
      });
    },
  };
}

const LEGAL_BANNER = `/*! App Context Viewer, MIT licensed. The bundled third-party code and its licences are listed in ${NOTICES}, shipped beside this file. */`;
const legalOutput = { banner: LEGAL_BANNER, comments: { legal: true } };

// Stack and constraints: docs/architecture.md ("Stack") and issue #14 (relative asset paths, the
// sample Catalog bundled, the elk worker created through `?worker`).
export default defineConfig({
  base: './',
  plugins: [preact(), shipThirdPartyNotices(), shipDemoCatalogs()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  worker: {
    format: 'es',
    rolldownOptions: { output: legalOutput },
  },
  build: {
    // dist/.vite/manifest.json feeds scripts/check-bundle.mjs (budgets 13 and 14).
    manifest: true,
    rolldownOptions: { output: legalOutput },
  },
});
