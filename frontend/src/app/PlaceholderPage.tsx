/** Stands in for a page whose slice has not been built yet. */
export function PlaceholderPage({ title }: { title: string }) {
  return (
    <section>
      <h1>{title}</h1>
      <p>This page is coming in a later slice.</p>
    </section>
  )
}
