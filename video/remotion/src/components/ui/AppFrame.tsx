import React from "react";
import { staticFile } from "remotion";
import { colors } from "../../theme";
import { fontDisplay, fontBody } from "../../fonts";

// Recreates the real Takda chrome from src/App.jsx — the desktop
// <Sidebar> (nav items, active pill, "Add" button) and the compact
// mobile top bar — so device mockups read as the actual product, not a
// generic dashboard template.
const NAV_ITEMS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "subjects", label: "Subjects" },
  { key: "activities", label: "Activities" },
  { key: "calendar", label: "Calendar" },
  { key: "notes", label: "Notes" },
];

export function AppFrame({
  active,
  compact,
  children,
}: {
  active: string;
  compact: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        fontFamily: fontBody,
        background: colors.bg,
      }}
    >
      {!compact && (
        <div
          style={{
            width: 168,
            flexShrink: 0,
            background: colors.white,
            borderRight: `1px solid ${colors.border}`,
            padding: "18px 14px",
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 22, padding: "0 2px" }}>
            <img src={staticFile("takda-icon.png")} width={26} height={26} style={{ borderRadius: 7 }} />
            <span style={{ fontFamily: fontDisplay, fontWeight: 600, fontSize: 16, color: colors.ink }}>
              Takda
            </span>
          </div>
          {NAV_ITEMS.map((it) => {
            const isActive = it.key === active;
            return (
              <div
                key={it.key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "9px 10px",
                  borderRadius: 10,
                  fontSize: 12.5,
                  fontWeight: 600,
                  background: isActive ? colors.primarySoft : "transparent",
                  color: isActive ? colors.primary : colors.slate500,
                }}
              >
                {it.label}
              </div>
            );
          })}
          <div
            style={{
              marginTop: 14,
              textAlign: "center",
              background: colors.primary,
              color: colors.white,
              fontSize: 12,
              fontWeight: 700,
              borderRadius: 10,
              padding: "9px 0",
            }}
          >
            + Add Subject
          </div>
        </div>
      )}

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        {compact && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "16px 16px 8px",
              flexShrink: 0,
            }}
          >
            <img src={staticFile("takda-icon.png")} width={22} height={22} style={{ borderRadius: 6 }} />
            <span style={{ fontFamily: fontDisplay, fontWeight: 600, fontSize: 15, color: colors.ink }}>
              Takda
            </span>
          </div>
        )}
        <div style={{ flex: 1, minHeight: 0, padding: compact ? "4px 16px 16px" : "22px 26px" }}>
          {children}
        </div>
      </div>
    </div>
  );
}
