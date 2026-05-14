export function GlowBadge({ status, text }: { status: 'success' | 'danger' | 'warning' | 'neutral', text: string }) {
  const styles = {
    success: 'bg-green-400/10 text-green-400 border-green-400/30 shadow-[0_0_10px_rgba(34,197,94,0.2)]',
    danger:  'bg-red-400/10 text-red-400 border-red-400/30 shadow-[0_0_10px_rgba(239,68,68,0.2)]',
    warning: 'bg-yellow-400/10 text-yellow-400 border-yellow-400/30 shadow-[0_0_10px_rgba(250,204,21,0.2)]',
    neutral: 'bg-white/5 text-gray-400 border-white/10 shadow-[0_0_10px_rgba(255,255,255,0.05)]',
  };

  return (
    <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border font-bold ${styles[status]}`}>
      {text}
    </span>
  );
}
