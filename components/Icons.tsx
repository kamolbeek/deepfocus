type P = { className?: string };
const base = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  viewBox: "0 0 24 24",
  "aria-hidden": true,
};

export const TimerIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <circle cx="12" cy="13" r="8" />
    <path d="M12 9v4l2 2" />
    <path d="M9 2h6" />
  </svg>
);
export const ListIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="m3 7 2 2 4-4" />
    <path d="m3 17 2 2 4-4" />
    <path d="M13 6h8" />
    <path d="M13 12h8" />
    <path d="M13 18h8" />
  </svg>
);
export const ChartIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M3 3v18h18" />
    <path d="M18 17V9" />
    <path d="M13 17V5" />
    <path d="M8 17v-3" />
  </svg>
);
export const FlameIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
  </svg>
);
export const ResetIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
  </svg>
);
export const SkipIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <polygon points="5 4 15 12 5 20 5 4" />
    <line x1="19" y1="5" x2="19" y2="19" />
  </svg>
);
export const TargetIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="6" />
    <circle cx="12" cy="12" r="2" />
  </svg>
);
export const ChevronIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="m9 18 6-6-6-6" />
  </svg>
);
export const PlusIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M5 12h14" />
    <path d="M12 5v14" />
  </svg>
);
export const CheckIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M20 6 9 17l-5-5" />
  </svg>
);
export const TrashIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M3 6h18" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);
export const UserIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </svg>
);
export const CloudIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M17.5 19H8a5 5 0 1 1 1.1-9.9A6 6 0 0 1 20.6 12 3.5 3.5 0 0 1 17.5 19Z" />
  </svg>
);
export const MailIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m3 7 9 6 9-6" />
  </svg>
);
export const GoogleIcon = ({ className }: P) => (
  <svg viewBox="0 0 24 24" aria-hidden className={className}>
    <path fill="#4285F4" d="M22.6 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.3-4.8 3.3-8Z" />
    <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.8c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.9A11 11 0 0 0 12 23Z" />
    <path fill="#FBBC05" d="M5.8 14.1a6.6 6.6 0 0 1 0-4.2V7H2.1a11 11 0 0 0 0 10l3.7-2.9Z" />
    <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7l3.7 2.9C6.7 7.3 9.1 5.4 12 5.4Z" />
  </svg>
);
export const SendIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M21 3 10.5 13.5" />
    <path d="M21 3 14.5 21l-4-7.5L3 9.5 21 3Z" />
  </svg>
);
export const CoinIcon = ({ className }: P) => (
  <svg viewBox="0 0 24 24" aria-hidden className={className}>
    <circle cx="12" cy="12" r="10" fill="#F5B301" />
    <circle cx="12" cy="12" r="7" fill="none" stroke="#FFD95A" strokeWidth="1.6" />
    <path d="M12 8.2v7.6M9.8 10h3.6a1.4 1.4 0 0 1 0 2.8h-2.8a1.4 1.4 0 0 0 0 2.8h3.6" fill="none" stroke="#B57F00" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);
export const PawIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M12 21c-3.5 0-6-2-6-4.5S8.7 12 12 12s6 2 6 4.5-2.5 4.5-6 4.5Z" />
    <circle cx="5.5" cy="9.5" r="1.8" />
    <circle cx="9.5" cy="5.5" r="1.8" />
    <circle cx="14.5" cy="5.5" r="1.8" />
    <circle cx="18.5" cy="9.5" r="1.8" />
  </svg>
);
export const LockIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </svg>
);
