import React from "react";
import { staticFile } from "remotion";
import { fontDisplay } from "../fonts";

// Recreates the sidebar brand mark from App.jsx (Sidebar component):
// the real takda-icon.png app icon next to the "Takda" wordmark set in
// Fraunces — same asset, same pairing, just scaled up for hero use.
export function Logo({
  size = 96,
  gap = 20,
  textSize = 56,
  color = "#FFFFFF",
  vertical = false,
}: {
  size?: number;
  gap?: number;
  textSize?: number;
  color?: string;
  vertical?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: vertical ? "column" : "row",
        alignItems: "center",
        gap,
      }}
    >
      <img
        src={staticFile("takda-icon.png")}
        width={size}
        height={size}
        style={{
          borderRadius: size * 0.24,
          objectFit: "cover",
          boxShadow: "0 12px 40px rgba(0,0,0,0.35)",
        }}
      />
      <span
        style={{
          fontFamily: fontDisplay,
          fontWeight: 600,
          fontSize: textSize,
          letterSpacing: -0.5,
          color,
          lineHeight: 1,
        }}
      >
        Takda
      </span>
    </div>
  );
}
