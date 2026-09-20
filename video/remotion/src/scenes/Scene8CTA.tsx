import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, staticFile } from "remotion";
import { GradientBackground } from "../components/GradientBackground";
import { fontDisplay, fontBody } from "../fonts";
import type { Orientation } from "../types";

// SFX cues: logo return — soft whoosh + chime; CTA button pop — light tap
// (timeline.ts audioCues).
export function Scene8CTA({ orientation }: { orientation: Orientation }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const vertical = orientation === "vertical";

  const logoP = spring({ frame, fps, config: { damping: 13, mass: 0.6 } });
  const logoOpacity = Math.min(1, logoP * 1.5);
  const logoScale = 0.7 + Math.min(1, logoP) * 0.3;

  const headP = spring({ frame: frame - 12, fps, config: { damping: 15, mass: 0.6 } });
  const headOpacity = Math.max(0, Math.min(1, headP));
  const headY = (1 - Math.max(0, headP)) * 16;

  const tagP = spring({ frame: frame - 24, fps, config: { damping: 15, mass: 0.6 } });
  const tagOpacity = Math.max(0, Math.min(1, tagP));

  const btnP = spring({ frame: frame - 40, fps, config: { damping: 10, mass: 0.45 } });
  const btnOpacity = Math.max(0, Math.min(1, btnP * 1.4));
  const btnScale = 0.7 + Math.min(1, btnP) * 0.3;

  const urlP = spring({ frame: frame - 56, fps, config: { damping: 16, mass: 0.6 } });
  const urlOpacity = Math.max(0, Math.min(1, urlP));

  const logoSize = vertical ? 92 : 84;

  return (
    <AbsoluteFill>
      <GradientBackground variant="dark" />
      <AbsoluteFill style={{ flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <img
          src={staticFile("takda-icon.png")}
          width={logoSize}
          height={logoSize}
          style={{
            borderRadius: logoSize * 0.24,
            opacity: logoOpacity,
            transform: `scale(${logoScale})`,
            boxShadow: "0 16px 48px rgba(0,0,0,0.4)",
            marginBottom: 26,
          }}
        />

        <div
          style={{
            opacity: headOpacity,
            transform: `translateY(${headY}px)`,
            textAlign: "center",
            padding: "0 60px",
            fontFamily: fontDisplay,
            fontWeight: 600,
            fontSize: vertical ? 42 : 48,
            color: "#FFFFFF",
            lineHeight: 1.15,
          }}
        >
          Stay on track with Takda.
        </div>

        <div
          style={{
            opacity: tagOpacity,
            marginTop: 14,
            fontFamily: fontBody,
            fontWeight: 500,
            fontSize: vertical ? 19 : 20,
            color: "#E8CF9A",
            letterSpacing: 0.5,
          }}
        >
          Plan. Organize. Achieve.
        </div>

        <div
          style={{
            opacity: btnOpacity,
            transform: `scale(${btnScale})`,
            marginTop: 34,
            background: "#FFFFFF",
            color: "#3D2FE0",
            fontFamily: fontBody,
            fontWeight: 700,
            fontSize: 18,
            borderRadius: 999,
            padding: "16px 44px",
            boxShadow: "0 14px 40px rgba(0,0,0,0.35)",
          }}
        >
          Try Takda
        </div>

        {/* Reserved space for the official domain — swap the placeholder
            below for the real URL once decided. */}
        <div
          style={{
            opacity: urlOpacity,
            marginTop: 22,
            fontFamily: fontBody,
            fontWeight: 500,
            fontSize: 14,
            color: "rgba(255,255,255,0.5)",
            letterSpacing: 0.5,
          }}
        >
          takda.app
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
