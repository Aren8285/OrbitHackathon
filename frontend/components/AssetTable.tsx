export default function AssetTable() {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          <th>Asset</th>
          <th>Criticality</th>
          <th>Exposure</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>FinPay Core</td>
          <td>5</td>
          <td>High</td>
        </tr>
      </tbody>
    </table>
  );
}
