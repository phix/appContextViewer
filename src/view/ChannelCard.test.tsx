import { fireEvent, render, screen } from '@testing-library/preact';
import { describe, expect, it, vi } from 'vitest';
import { ChannelCard } from '@/view';
import { channelCardOf } from './fixtures.test-helper';

/**
 * The Channel card (docs/center.md, decision 8): a name, publishers and subscribers as clickable
 * Application rows, and a dismiss. It never selects by itself — the row's callback does that.
 */

function noop() {
  /* the test does not care */
}

function renderCard(name: string, props: Partial<Parameters<typeof ChannelCard>[0]> = {}) {
  return render(
    <ChannelCard
      model={channelCardOf(name)}
      onSelectApplication={noop}
      onDismiss={noop}
      {...props}
    />,
  );
}

function rowIds(side: 'Publishers' | 'Subscribers'): string[] {
  return screen
    .getAllByTestId('channel-row')
    .filter((row) => row.dataset.side === side)
    .map((row) => row.querySelector('[data-testid="channel-link"]')?.getAttribute('data-id') ?? '');
}

describe('ChannelCard', () => {
  it('names the Channel and lists its publishers and subscribers', () => {
    renderCard('orders.placed');

    expect(screen.getByTestId('channel-name').textContent).toBe('orders.placed');
    expect(rowIds('Publishers')).toEqual(['acme/commerce/order-service']);
    expect(rowIds('Subscribers')).toEqual([
      'acme/platform-core/notification-service',
      'acme/commerce/inventory-service',
      'acme/commerce/checkout-worker',
      'acme/data/events-pipeline',
    ]);
  });

  it('selects the Application of the row that was clicked', () => {
    const onSelectApplication = vi.fn();
    renderCard('orders.placed', { onSelectApplication });

    const link = screen
      .getAllByTestId('channel-link')
      .find((candidate) => candidate.dataset.id === 'acme/data/events-pipeline');
    fireEvent.click(link as HTMLElement);

    expect(onSelectApplication).toHaveBeenCalledWith('acme/data/events-pipeline');
  });

  it('says so plainly for a one-sided Channel (the demo Catalog warns about two)', () => {
    // orders.shipped has subscribers and no publisher; fraud.alerts is the mirror image.
    renderCard('orders.shipped');

    expect(screen.getByTestId('channel-publishers-none').textContent).toBe('None in this Catalog');
    expect(rowIds('Publishers')).toEqual([]);
    expect(rowIds('Subscribers')).toEqual([
      'acme/platform-core/notification-service',
      'acme/commerce/inventory-service',
    ]);
  });

  it('is dismissible', () => {
    const onDismiss = vi.fn();
    renderCard('orders.placed', { onDismiss });

    fireEvent.click(screen.getByTestId('channel-dismiss'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
