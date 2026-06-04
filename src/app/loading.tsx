export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-navy-50">
      <div
        className="h-10 w-10 animate-spin rounded-full border-4 border-navy-200 border-t-accent"
        role="status"
        aria-label="Loading"
      />
    </div>
  );
}
