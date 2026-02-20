export function SharePageLoading() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="w-12 h-12 bg-muted animate-pulse rounded-sm" />
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-full bg-muted animate-pulse" />
                <div className="h-4 w-40 bg-muted animate-pulse rounded" />
              </div>
              <div className="h-9 w-28 bg-muted animate-pulse rounded-sm" />
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 pt-8 pb-24 sm:pb-28 max-w-6xl">
        <div className="space-y-6">
          <div className="w-full">
            <div className="bg-card border rounded-xl shadow-sm">
              <div className="p-4 sm:p-6">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-5 h-5 bg-muted animate-pulse rounded" />
                  <div className="h-5 w-24 bg-muted animate-pulse rounded" />
                </div>
                <div className="h-px bg-border my-3" />
                <div className="flex justify-center mt-4">
                  <div className="w-1/2">
                    <div className="w-full aspect-video bg-muted animate-pulse rounded-lg" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-card border rounded-xl shadow-sm">
            <div className="p-6 space-y-4">
              <div className="h-6 w-32 bg-muted animate-pulse rounded" />
            </div>
            <div className="px-6 pb-6">
              <div className="grid grid-cols-3 gap-4">
                {[1, 2, 3].map((index) => (
                  <div key={index} className="aspect-square bg-muted animate-pulse rounded-lg" />
                ))}
              </div>
            </div>
          </div>

          <div className="bg-card border rounded-xl shadow-sm">
            <div className="p-6 space-y-4">
              <div className="h-6 w-40 bg-muted animate-pulse rounded" />
            </div>
            <div className="px-6 pb-6">
              <div className="flex flex-col lg:flex-row gap-6">
                <div className="lg:w-1/2 order-2 lg:order-1 space-y-3">
                  <div className="h-4 w-20 bg-muted animate-pulse rounded" />
                  <div className="h-4 w-full bg-muted animate-pulse rounded" />
                  <div className="h-4 w-3/4 bg-muted animate-pulse rounded" />
                  <div className="h-4 w-5/6 bg-muted animate-pulse rounded" />
                </div>
                <div className="lg:w-1/2 order-1 lg:order-2 space-y-3">
                  <div className="h-4 w-16 bg-muted animate-pulse rounded" />
                  <div className="h-4 w-full bg-muted animate-pulse rounded" />
                  <div className="h-4 w-2/3 bg-muted animate-pulse rounded" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
