export default function AppLoading() {
  return (
    <div className="flex h-full w-full flex-col gap-6 p-4 md:p-6 animate-pulse">
      {/* Top Header Placeholder */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2">
          <div className="h-4 w-32 rounded bg-muted/80" />
          <div className="h-8 w-64 rounded-lg bg-muted" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-9 w-28 rounded-lg bg-muted" />
          <div className="h-9 w-32 rounded-lg bg-muted" />
        </div>
      </div>

      {/* Filter / Search Bar Placeholder */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/60 bg-card/60 p-3 shadow-sm">
        <div className="h-9 min-w-[200px] flex-1 rounded-lg bg-muted/80" />
        <div className="h-9 w-28 rounded-lg bg-muted/60" />
        <div className="h-9 w-28 rounded-lg bg-muted/60" />
        <div className="h-9 w-36 rounded-lg bg-muted/60" />
      </div>

      {/* Content Skeleton: Multi-column Kanban / Grid layout */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 flex-1">
        {Array.from({ length: 5 }).map((_, colIdx) => (
          <div
            key={colIdx}
            className="flex flex-col gap-3 rounded-xl border border-border/50 bg-card/40 p-3"
          >
            {/* Column Header */}
            <div className="flex items-center justify-between pb-2 border-b border-border/40">
              <div className="h-5 w-24 rounded bg-muted" />
              <div className="h-5 w-7 rounded-full bg-muted/70" />
            </div>

            {/* Simulated Cards */}
            {Array.from({ length: 3 }).map((_, cardIdx) => (
              <div
                key={cardIdx}
                className="flex flex-col gap-2.5 rounded-lg border border-border/40 bg-card p-3 shadow-xs"
              >
                <div className="flex items-center justify-between">
                  <div className="h-4 w-28 rounded bg-muted" />
                  <div className="size-4 rounded-full bg-muted/60" />
                </div>
                <div className="h-3 w-36 rounded bg-muted/60" />
                <div className="flex items-center gap-2 pt-1">
                  <div className="h-5 w-14 rounded-full bg-muted/70" />
                  <div className="h-5 w-16 rounded-full bg-muted/50" />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
