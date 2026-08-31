interface InfoCardProps {
  readonly label: string;
  readonly value: string;
  readonly detail?: string;
}

export function InfoCard({
  label,
  value,
  detail,
}: InfoCardProps): React.JSX.Element {
  return (
    <article className="info-card">
      <span className="card-label">{label}</span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </article>
  );
}
