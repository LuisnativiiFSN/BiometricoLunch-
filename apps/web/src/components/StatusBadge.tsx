export function StatusBadge({ active }: { active: boolean }) {
  return (
    <span className={`status-badge ${active ? 'is-active' : 'is-inactive'}`}>
      <span aria-hidden="true" />
      {active ? 'Activo' : 'Inactivo'}
    </span>
  );
}
