/**
 * Scales a budget from docs/performance-budgets.md by BUDGET_FACTOR. CI sets BUDGET_FACTOR=4 so a slow
 * runner does not block a merge while a real regression still does; unset, the factor is 1.
 *
 *   expect(elapsed).toBeLessThanOrEqual(budget(500)); // budget 2: load to table
 */
export function budget(ms: number): number {
  return ms * Number(process.env.BUDGET_FACTOR ?? 1);
}
