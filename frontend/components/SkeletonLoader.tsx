export function SkeletonLoader({ className = '' }: { className?: string }) {
  return (
    <div className={`shimmer rounded-md bg-white/[0.03] ${className}`} />
  );
}
