interface SwitchProps {
  checked: boolean;
  onChange: () => void;
  label: React.ReactNode;
  disabled?: boolean;
}

// A real checkbox underneath (native keyboard/screen-reader semantics —
// space to toggle, "checkbox" role announced automatically) with the
// visible track/thumb painted entirely in CSS. No extra JS state needed for
// the animation; the thumb's slide is a CSS transition on its own inset.
export function Switch({ checked, onChange, label, disabled }: SwitchProps) {
  return (
    <label className={`switch-row${disabled ? " switch-row-disabled" : ""}`}>
      <input
        type="checkbox"
        className="switch-input"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
      />
      <span className="switch-track" aria-hidden="true">
        <span className="switch-thumb" />
      </span>
      <span className="switch-label">{label}</span>
    </label>
  );
}
