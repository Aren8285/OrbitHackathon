type RiskCardProps = {
  title: string;
  value: string;
  subtitle?: string;
};

export default function RiskCard({ title, value, subtitle }: RiskCardProps) {
  return (
    <div style={{ border: '1px solid #d0d7de', borderRadius: 12, padding: 16 }}>
      <h3>{title}</h3>
      <p style={{ fontSize: 28, margin: '8px 0' }}>{value}</p>
      {subtitle ? <small>{subtitle}</small> : null}
    </div>
  );
}
