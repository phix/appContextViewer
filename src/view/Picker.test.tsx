import { fireEvent, render, screen } from '@testing-library/preact';
import { createRef } from 'preact';
import { describe, expect, it, vi } from 'vitest';
import { Picker } from '@/view';

function catalogFile(name = 'catalog.json'): File {
  return new File(['{"schemaVersion":1,"applications":[]}'], name, { type: 'application/json' });
}

describe('Picker', () => {
  it('reports the file chosen through the input', () => {
    const onPick = vi.fn();
    render(<Picker onPick={onPick} />);

    const input = screen.getByTestId('picker-input') as HTMLInputElement;
    const file = catalogFile();
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    fireEvent.change(input);

    expect(onPick).toHaveBeenCalledWith(file);
  });

  it('reports a dropped file (docs/catalog-sources.md, decision 2)', () => {
    const onPick = vi.fn();
    render(<Picker onPick={onPick} />);

    const file = catalogFile('dropped.json');
    fireEvent.drop(screen.getByTestId('picker'), { dataTransfer: { files: [file] } });

    expect(onPick).toHaveBeenCalledWith(file);
  });

  it('ignores a drop that carries no file', () => {
    const onPick = vi.fn();
    render(<Picker onPick={onPick} />);

    fireEvent.drop(screen.getByTestId('picker'), { dataTransfer: { files: [] } });

    expect(onPick).not.toHaveBeenCalled();
  });

  it('exposes its input so the report can reopen it ("Choose another file")', () => {
    const inputRef = createRef<HTMLInputElement>();
    render(<Picker onPick={() => undefined} inputRef={inputRef} />);

    expect(inputRef.current).toBe(screen.getByTestId('picker-input'));
  });
});
