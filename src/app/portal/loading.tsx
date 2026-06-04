export default function PortalLoading() {
  return (
    <div className="flex items-center justify-center py-24">
      <div
        className="h-8 w-8 animate-spin rounded-full border-4 border-navy-200 border-t-accent"
        role="status"
        aria-label="Loading"
      />
    </div>
  );
}
