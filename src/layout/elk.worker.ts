/*!
 * elkjs 0.12.0 (Eclipse Layout Kernel for JavaScript), used unmodified.
 * Copyright (c) Kiel University and others.
 * Licensed under the Eclipse Public License 2.0 (EPL-2.0), https://www.eclipse.org/legal/epl-2.0.
 * Source: https://github.com/kieler/elkjs
 * The GPL-3.0-or-later secondary licence is not elected (docs/adr/0001-elkjs-under-epl-2.0.md).
 * The full licence text ships beside this file in THIRD-PARTY-NOTICES.md.
 */

// The Overview's Web Worker: elkjs's own worker build. Evaluated inside a Worker (no `document`,
// `self` present) it installs its message handler on `self` and answers the elk protocol that
// elk.ts speaks ({ cmd: 'register' | 'layout', id, ... } in; { id, data } | { id, error } out).
// This file adds nothing to elkjs (ADR 0001, obligation 3); its only content of its own is the
// licence header above, which esbuild-style legal-comment handling keeps in the built chunk since
// elk-worker.min.js itself carries no licence comment.
import 'elkjs/lib/elk-worker.min.js';
