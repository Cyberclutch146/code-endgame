'use client';

export function StatusBanner({ error }: { error: string | null }) {
  if (!error) return null;

  return (
    <div className="mb-6 w-full animate-slide-in">
      <div className="p-4 rounded-xl border border-red-500/30 bg-red-500/10 shadow-[0_0_20px_rgba(239,68,68,0.15)] backdrop-blur-md flex items-start gap-4">
        <div className="mt-0.5">
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-bold text-red-400">Connection Error</h3>
          <p className="text-sm text-red-300/80 mt-1">{error}</p>
        </div>
      </div>
    </div>
  );
}
