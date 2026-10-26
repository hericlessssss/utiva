interface Props {
  checked: boolean;
  label: string;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  /** Mostra o rótulo ao lado do switch (padrão: só para leitores de tela). */
  showLabel?: boolean;
}

export function Switch({ checked, label, onChange, disabled = false, showLabel = false }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={showLabel ? undefined : label}
      className="switch"
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="switch-track" aria-hidden="true">
        <span className="switch-knob" />
      </span>
      {showLabel && <span className="switch-label">{label}</span>}
    </button>
  );
}
