interface RadioProps {
  name: string;
  checked: boolean;
  onChange: () => void;
  label: React.ReactNode;
  disabled?: boolean;
}

// Same "real input underneath, painted dot on top" pattern as Switch.tsx —
// native radio semantics (arrow-key/space handling, "radio" role, grouping
// via `name`) for free, with the visible dot entirely in CSS.
export function Radio({ name, checked, onChange, label, disabled }: RadioProps) {
  return (
    <label className={`radio-row${disabled ? " radio-row-disabled" : ""}`}>
      <input
        type="radio"
        name={name}
        className="radio-input"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
      />
      <span className="radio-dot" aria-hidden="true" />
      <span className="radio-label">{label}</span>
    </label>
  );
}
