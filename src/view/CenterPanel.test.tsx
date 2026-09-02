import { fireEvent, render, screen } from '@testing-library/preact';
import { describe, expect, it, vi } from 'vitest';
import { CenterPanel } from '@/view';

describe('CenterPanel', () => {
  it('names an Application Center by kind and id', () => {
    render(<CenterPanel center={{ kind: 'application', id: 'acme/platform-core/auth-service' }} />);

    expect(screen.getByTestId('center-kind').textContent).toBe('Application');
    expect(screen.getByTestId('center-id').textContent).toBe('acme/platform-core/auth-service');
  });

  it('names an External Center the same way (docs/center.md, decision 1)', () => {
    render(<CenterPanel center={{ kind: 'external', id: 'redis' }} />);

    expect(screen.getByTestId('center-kind').textContent).toBe('External');
    expect(screen.getByTestId('center-id').textContent).toBe('redis');
  });

  it('clears the selection when the shell offers a handler', () => {
    const onClear = vi.fn();
    render(<CenterPanel center={{ kind: 'external', id: 'redis' }} onClear={onClear} />);

    fireEvent.click(screen.getByTestId('center-clear'));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('omits the clear button when no handler is given', () => {
    render(<CenterPanel center={{ kind: 'external', id: 'redis' }} />);
    expect(screen.queryByTestId('center-clear')).toBeNull();
  });
});
