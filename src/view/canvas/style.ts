import type cytoscape from 'cytoscape';

/** Cytoscape-only presentation for both canvases. Domain choices stay in their callers. */
export const canvasStyle: cytoscape.StylesheetJson = [
  {
    selector: 'node',
    style: {
      width: 'data(width)',
      height: 'data(height)',
      label: 'data(label)',
      'font-family': 'IBM Plex Sans, ui-sans-serif, system-ui, sans-serif',
      'font-size': '12px',
      'text-wrap': 'ellipsis',
      'text-max-width': '132px',
      color: '#e7ecf3',
      'background-color': '#1a212c',
      'border-color': '#313b4a',
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
      'background-color': '#241f30',
      'border-color': '#5b4d78',
    },
  },
  {
    selector: 'node[center = "true"]',
    style: {
      'border-color': '#4fc3f7',
      'border-width': 4,
      'background-color': '#0f2d3a',
      'font-weight': 700,
      'z-index': 20,
    },
  },
  {
    selector: 'node[kind = "group"]',
    style: {
      shape: 'round-rectangle',
      label: 'data(label)',
      'background-color': '#151b24',
      'background-opacity': 0.6,
      'border-color': '#313b4a',
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
      'line-color': '#3d4759',
      'target-arrow-color': '#5c6577',
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
      'background-color': 'rgba(251, 191, 36, 0.16)',
      'border-color': '#fbbf24',
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
      'line-color': '#4fc3f7',
      'target-arrow-color': '#4fc3f7',
      'border-color': '#4fc3f7',
      opacity: 1,
      'z-index': 30,
    },
  },
];
