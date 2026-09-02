/**
 * The file picker and drag-drop zone, always available (docs/catalog-sources.md, decision 2: the
 * primary path, works on every origin with no host, no CORS and no token). The report's "Choose
 * another file" reopens it through `inputRef`, which the shell clicks and focuses.
 */

import type { Ref } from 'preact';

export interface PickerProps {
  readonly onPick: (file: File) => void;
  /** The shell keeps this so "Choose another file" can reopen the native dialog. */
  readonly inputRef?: Ref<HTMLInputElement>;
}

export function Picker({ onPick, inputRef }: PickerProps) {
  const takeFirst = (files: FileList | null | undefined) => {
    const file = files?.[0];
    if (file !== undefined) {
      onPick(file);
    }
  };

  return (
    // The drop zone's keyboard path is the labelled file input inside it, which is focusable and
    // opens the same dialog; dragging is a mouse-only enhancement over that.
    <section
      class="picker"
      data-testid="picker"
      aria-label="Load a Catalog"
      onDragOver={(event) => {
        event.preventDefault();
      }}
      onDrop={(event) => {
        event.preventDefault();
        takeFirst(event.dataTransfer?.files);
      }}
    >
      <label class="picker__label">
        Load a Catalog
        <input
          ref={inputRef}
          type="file"
          accept="application/json,.json"
          data-testid="picker-input"
          onChange={(event) => {
            const input = event.currentTarget as HTMLInputElement;
            takeFirst(input.files);
            // Clears the value so choosing the same file twice fires `change` again.
            input.value = '';
          }}
        />
      </label>
      <p class="picker__hint">or drop a JSON file here</p>
    </section>
  );
}
