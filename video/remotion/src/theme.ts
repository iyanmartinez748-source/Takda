// Design tokens lifted directly from the live Takda app
// (../../src/App.jsx, index.html, manifest.webmanifest) so the commercial
// uses the product's real palette and type system instead of a new one.
export const colors = {
  primary: "#3D2FE0",
  primaryDark: "#2E22B0",
  primarySoft: "#EEECFC",
  primaryTint: "#DCD9FF",
  primaryBorder: "#C7C7E8",
  border: "#E4E4F0",
  bg: "#F5F6FA",
  ink: "#1B1B2F",
  slate700: "#334155",
  slate500: "#64748B",
  slate400: "#94A3B8",
  white: "#FFFFFF",

  // Subject accent palette (COLORS[] in App.jsx)
  subjects: [
    "#3D2FE0",
    "#FF5A5F",
    "#16A34A",
    "#F59E0B",
    "#0EA5A4",
    "#DB2777",
    "#7C3AED",
    "#2563EB",
  ],

  // Urgency / status tokens (URGENCY_STYLE / STATUS_LABEL in App.jsx)
  danger: { dot: "#FF5A5F", text: "#B91C1C", bg: "#FEF2F2" },
  warn: { dot: "#F59E0B", text: "#92400E", bg: "#FFFBEB" },
  success: { dot: "#16A34A", text: "#166534", bg: "#F0FDF4" },
  neutral: { dot: "#94A3B8", text: "#475569", bg: "#F8FAFC" },
  info: { dot: "#2563EB", text: "#1D4ED8", bg: "#EFF6FF" },
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 999,
};

export const shadow = {
  card: "0 1px 2px rgba(15,23,42,0.04), 0 8px 24px rgba(15,23,42,0.06)",
  float: "0 20px 60px rgba(61,47,224,0.18), 0 4px 16px rgba(15,23,42,0.08)",
  deep: "0 30px 80px rgba(27,27,47,0.35)",
};
