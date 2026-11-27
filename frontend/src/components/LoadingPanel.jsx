export default function LoadingPanel({ label, children }) {
  return (
    <>
      <span className="visually-hidden" role="status">{label}</span>
      <div className="loading-shapes" aria-hidden="true">
        {children ?? (
          <>
            <div className="skeleton skeleton-line-short" />
            <div className="skeleton skeleton-row" />
            <div className="skeleton skeleton-row" />
            <div className="skeleton skeleton-row" />
          </>
        )}
      </div>
    </>
  );
}
