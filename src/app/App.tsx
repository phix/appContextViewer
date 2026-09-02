/** The slice of a Catalog the placeholder needs; the real types arrive with the catalog module. */
export type PlaceholderCatalog = {
  readonly applications: readonly unknown[];
};

/** Scaffold placeholder; the app shell slice replaces it. */
export function App({ catalog }: { catalog: PlaceholderCatalog }) {
  return (
    <main>
      <h1>App Context Viewer</h1>
      <p>
        Scaffold placeholder. The bundled sample Catalog holds {catalog.applications.length}{' '}
        Applications.
      </p>
    </main>
  );
}
