export default function RootLoading() {
  return (
    <div className="flex min-h-screen w-full flex-col bg-background text-foreground animate-pulse">
      {/* Top Header Placeholder */}
      <div className="flex h-16 w-full items-center justify-between border-b border-border/60 px-6">
        <div className="flex items-center gap-4">
          <div className="h-8 w-32 rounded-lg bg-muted" />
        </div>
        <div className="flex items-center gap-3">
          <div className="size-9 rounded-full bg-muted" />
          <div className="size-9 rounded-full bg-muted" />
        </div>
      </div>

      {/* Main Body with Sidebar + Content */}
      <div className="flex flex-1">
        {/* Sidebar Skeleton */}
        <div className="hidden md:flex w-64 flex-col gap-3 border-r border-border/60 p-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-9 w-full rounded-lg bg-muted/60" />
          ))}
        </div>

        {/* Content Area */}
        <div className="flex-1 p-6">
          <div className="h-7 w-48 rounded-lg bg-muted mb-6" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="h-32 rounded-xl border border-border/60 bg-card p-4" />
            <div className="h-32 rounded-xl border border-border/60 bg-card p-4" />
            <div className="h-32 rounded-xl border border-border/60 bg-card p-4" />
          </div>
        </div>
      </div>
    </div>
  )
}
