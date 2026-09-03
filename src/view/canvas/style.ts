import type cytoscape from 'cytoscape';

/** Cytoscape-only presentation for both canvases. Domain choices stay in their callers. */
export const canvasStyle: cytoscape.StylesheetJson = [
  {
    selector: 'node',
    style: {
      width: 'data(width)',
      height: 'data(height)',
      label: 'data(label)',
      'font-family': 'ui-sans-serif, system-ui, sans-serif',
      'font-size': '12px',
      'text-wrap': 'ellipsis',
      'text-max-width': '132px',
      color: '#172033',
      'background-color': '#eef2ff',
      'border-color': '#8b9bb4',
      'border-width': 1,
      'text-valign': 'center',
      'text-halign': 'center',
      'overlay-opacity': 0,
    },
  },
  {
    selector: 'node[kind = "external"]',
    style: {
      shape: 'round-rectangle',
      'background-color': '#fff4de',
      'border-color': '#c48626',
    },
  },
  {
    selector: 'node[center = "true"]',
    style: {
      'border-color': '#2563eb',
      'border-width': 4,
      'background-color': '#dbeafe',
      'font-weight': 700,
      'z-index': 20,
    },
  },
  {
    selector: 'node[kind = "group"]',
    style: {
      shape: 'round-rectangle',
      label: 'data(label)',
      'background-color': '#f8fafc',
      'background-opacity': 0.45,
      'border-color': '#cbd5e1',
      'border-style': 'dashed',
      'border-width': 1,
      'text-valign': 'top',
      'text-halign': 'left',
      'text-margin-x': 8,
      'text-margin-y': 8,
      padding: '22px',
      'compound-sizing-wrt-labels': 'include',
      'z-compound-depth': 'bottom',
      events: 'no',
    },
  },
  {
    selector: 'edge',
    style: {
      width: 1.5,
      'line-color': '#94a3b8',
      'target-arrow-color': '#64748b',
      'target-arrow-shape': 'triangle',
      'curve-style': 'bezier',
      'arrow-scale': 0.8,
      opacity: 0.72,
    },
  },
  /*
   * A Highlight (docs/tags.md): members lifted, everything else de-emphasised but still drawn. The
   * dim is opacity only, so no node moves and nothing leaves the canvas.
   */
  {
    selector: '.is-tagged',
    style: {
      'background-color': '#fef3c7',
      'border-color': '#d97706',
      'border-width': 3,
      'z-index': 25,
    },
  },
  {
    selector: '.is-dimmed',
    style: {
      opacity: 0.32,
    },
  },
  {
    selector: '.is-hovered',
    style: {
      'line-color': '#2563eb',
      'target-arrow-color': '#2563eb',
      'border-color': '#2563eb',
      opacity: 1,
      'z-index': 30,
    },
  },
];
