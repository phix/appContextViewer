import { render, screen } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';

// Proves the `jsdom` Vitest project renders Preact through Testing Library, as docs/architecture.md
// prescribes for the view. Deliberately independent of App.tsx, which the app shell slice replaces.
describe('vitest project: jsdom', () => {
  it('renders Preact into a DOM through Testing Library', () => {
    render(<p>jsdom is alive</p>);
    const line = screen.getByText('jsdom is alive');
    expect(line).toBeInstanceOf(HTMLParagraphElement);
    expect(document.body.contains(line)).toBe(true);
  });

  it('cleans the DOM between tests', () => {
    expect(screen.queryByText('jsdom is alive')).toBeNull();
  });
});
