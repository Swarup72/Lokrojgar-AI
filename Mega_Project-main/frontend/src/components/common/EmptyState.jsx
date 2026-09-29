import "./EmptyState.css";

export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="empty-state">
      {Icon && <Icon size={40} className="empty-state-icon" aria-hidden="true" />}
      {title && <h3>{title}</h3>}
      {description && <p>{description}</p>}
      {action && <div className="empty-state-action">{action}</div>}
    </div>
  );
}
