type Props = { name: string; className?: string };

// Simple, decorative line icons for the services grid.
export function ServiceIcon({ name, className = "h-6 w-6" }: Props) {
  const common = {
    className,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    viewBox: "0 0 24 24",
    "aria-hidden": true,
  };

  switch (name) {
    case "flame":
      return (
        <svg {...common}>
          <path d="M12 3c1 3 4 4 4 8a4 4 0 1 1-8 0c0-2 1-3 2-4 .5 2 2 2 2 4" />
        </svg>
      );
    case "snow":
      return (
        <svg {...common}>
          <path d="M12 2v20M2 12h20M5 5l14 14M19 5L5 19" />
        </svg>
      );
    case "swap":
      return (
        <svg {...common}>
          <path d="M7 7h11l-3-3M17 17H6l3 3" />
        </svg>
      );
    case "earth":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18" />
        </svg>
      );
    case "duct":
      return (
        <svg {...common}>
          <rect x="3" y="6" width="13" height="12" rx="1" />
          <path d="M16 9l5-2v10l-5-2M7 6v12" />
        </svg>
      );
    case "seal":
      return (
        <svg {...common}>
          <path d="M4 7h16M4 12h16M4 17h16M9 4v3M15 12v3" />
        </svg>
      );
    case "air":
      return (
        <svg {...common}>
          <path d="M3 8h11a3 3 0 1 0-3-3M3 16h14a3 3 0 1 1-3 3M3 12h17" />
        </svg>
      );
    case "wrench":
      return (
        <svg {...common}>
          <path d="M14 7a4 4 0 0 1-5 5l-5 5 2 2 5-5a4 4 0 0 1 5-5l-2-2 2-2-2-2-2 2z" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
        </svg>
      );
  }
}
