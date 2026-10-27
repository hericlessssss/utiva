/** Moeda do bazar (Tibia Coins): glifo inline, sem depender de asset externo. */
export function Coin() {
  return (
    <svg className="coin" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="7" fill="#f4c542" stroke="#9a6b00" strokeWidth="1" />
      <circle cx="8" cy="8" r="4.3" fill="none" stroke="#9a6b00" strokeWidth="1" opacity="0.7" />
    </svg>
  );
}
