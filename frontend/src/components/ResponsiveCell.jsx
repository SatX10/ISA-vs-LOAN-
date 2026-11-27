export default function ResponsiveCell({ label, children, className }) {
  return (
    <td role="cell" className={className}>
      {label && <span className="mobile-cell-label" aria-hidden="true">{label}</span>}
      <div className="mobile-cell-value">{children}</div>
    </td>
  );
}
