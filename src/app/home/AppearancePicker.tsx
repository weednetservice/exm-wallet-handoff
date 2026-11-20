import type { Appearance } from "../appearance"
import "./settings-view.css"

const options = [
  { value: "system", label: "Системная" },
  { value: "light", label: "Светлая" },
  { value: "dark", label: "Тёмная" },
] as const

function AppearanceSample({ mode }: { mode: "light" | "dark" }) {
  return <span className={`wallet-appearance-sample wallet-appearance-sample-${mode}`}>
    <i /><i /><i />
  </span>
}

export function AppearancePicker({ value, onChange }: { value: Appearance; onChange: (value: Appearance) => void }) {
  return <section aria-label="Оформление" className="wallet-appearance">
    <div className="wallet-appearance-options">
      {options.map((option) => <button key={option.value} type="button" aria-pressed={value === option.value} onClick={() => onChange(option.value)} className="wallet-appearance-option">
        <span aria-hidden="true" className={`wallet-appearance-preview wallet-appearance-${option.value}`}>
          {option.value !== "dark" ? <AppearanceSample mode="light" /> : null}
          {option.value !== "light" ? <AppearanceSample mode="dark" /> : null}
        </span>
        <span className="t-body2">{option.label}</span>
        <span aria-hidden="true" className="wallet-appearance-check">{value === option.value ? "✓" : ""}</span>
      </button>)}
    </div>
  </section>
}
