export default function Page() {
  return (
    <main style={{ padding: 32 }}>
      <h1>RiskOps Executive Dashboard</h1>
      <p>Portfolio-level risk overview, critical assets, and recommended spend.</p>
      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <div style={{ border: '1px solid #ddd', borderRadius: 12, padding: 16 }}>
          <h2>Enterprise Loss Exposure</h2>
          <p>$3.4M</p>
        </div>
        <div style={{ border: '1px solid #ddd', borderRadius: 12, padding: 16 }}>
          <h2>Critical Assets</h2>
          <p>12</p>
        </div>
        <div style={{ border: '1px solid #ddd', borderRadius: 12, padding: 16 }}>
          <h2>Priority Remediations</h2>
          <p>7</p>
        </div>
      </div>
    </main>
  );
}
