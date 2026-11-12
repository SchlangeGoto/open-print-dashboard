export function SpoolMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 256 256"
      aria-hidden="true"
      focusable="false"
      className={className}
      fill="none"
      stroke="currentColor"
    >
      <circle cx="128" cy="128" r="119" strokeWidth="10" />
      <circle cx="128" cy="128" r="63" strokeWidth="38" />
      <circle cx="128" cy="128" r="17" strokeWidth="14" />
      <g strokeWidth="9">
        <path d="M128 106V82" />
        <path d="M128 106V82" transform="rotate(60 128 128)" />
        <path d="M128 106V82" transform="rotate(120 128 128)" />
        <path d="M128 106V82" transform="rotate(180 128 128)" />
        <path d="M128 106V82" transform="rotate(240 128 128)" />
        <path d="M128 106V82" transform="rotate(300 128 128)" />
      </g>
    </svg>
  );
}
