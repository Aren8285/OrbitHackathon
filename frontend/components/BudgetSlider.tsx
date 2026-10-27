export default function BudgetSlider() {
  return <input type="range" min={0} max={1000000} step={1000} defaultValue={500000} style={{ width: '100%' }} />;
}
