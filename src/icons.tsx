// Both icons inherit color from currentColor; the shell sets the active color via
// ownerProps.active, so the component only needs the size (REF src/ui.tsx:124-135).
export function ChatEntryPanelIcon({ size }: { size: number; active: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 3.25h8A1.75 1.75 0 0 1 13.75 5v5A1.75 1.75 0 0 1 12 11.75H7l-3.75 2v-2.2A1.75 1.75 0 0 1 2.25 10V5A1.75 1.75 0 0 1 4 3.25Z M5 6.25h6 M5 8.75h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function ChatEntrySettingsIcon({ size }: { size: number; active: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 5h10 M3 8h10 M3 11h10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="6" cy="5" r="1.4" stroke="currentColor" strokeWidth="1.3" fill="none" />
      <circle cx="10" cy="8" r="1.4" stroke="currentColor" strokeWidth="1.3" fill="none" />
      <circle cx="7" cy="11" r="1.4" stroke="currentColor" strokeWidth="1.3" fill="none" />
    </svg>
  )
}
