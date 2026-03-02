// SectionHeader is now inlined in App.jsx using CSS classes
// Kept for any remaining imports
export function SectionHeader({ title, sub }) {
  return (
    <div className="section-header">
      <span className="section-title">{title}</span>
      {sub && <span className="section-sub">{sub}</span>}
    </div>
  );
}
