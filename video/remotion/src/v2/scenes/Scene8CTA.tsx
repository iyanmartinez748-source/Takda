import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, staticFile } from "remotion";
import { GradientBackground } from "../../components/GradientBackground";
import { fontDisplay, fontBody } from "../../fonts";
import type { Orientation } from "../../types";

// No domain line: takda.app was only ever a placeholder in V1 and isn't a
// confirmed official URL, so V2 drops it per the brief rather than
// advertising an unconfirmed address. "Try Takda" stands alone until a
// real URL is provided.
// SFX cues: logo return — soft impact + chime; CTA button pop + glow pulse
// loop starts (timeline.ts audioCues).
export function Scene8CTA({ orientation }: { orientation: Orientation }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const vertical = orientation === "vertical";

  const logoP = spring({ frame, fps, config: { damping: 12, mass: 0.6 } });
  const logoOpacity = Math.min(1, logoP * 1.5);
  const logoScale = 0.65 + Math.min(1, logoP) * 0.35;

  const headP = spring({ frame: frame - 12, fps, config: { damping: 15, mass: 0.6 } });
  const headOpacity = Math.max(0, Math.min(1, headP));
  const headY = (1 - Math.max(0, headP)) * 16;

  const tagP = spring({ frame: frame - 24, fps, config: { damping: 15, mass: 0.6 } });
  const tagOpacity = Math.max(0, Math.min(1, tagP));

  const btnP = spring({ frame: frame - 38, fps, config: { damping: 10, mass: 0.45 } });
  const btnOpacity = Math.max(0, Math.min(1, btnP * 1.4));
  const btnScale = 0.7 + Math.min(1, btnP) * 0.3;

  // Gentle breathing glow on the CTA button once it has landed, standing
  // in for the "subtle animated glow/hover effect" the brief asks for.
  const glowPulse = frame >= 44 ? (Math.sin((frame - 44) * 0.12) + 1) / 2 : 0;
  const glowSpread = 18 + glowPulse * 22;
  const glowAlpha = 0.25 + glowPulse * 0.25;

  const logoSize = vertical ? 108 : 96;

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
            boxShadow: "0 18px 54px rgba(0,0,0,0.42)",
            marginBottom: 28,
          }}
        />

        <div
          style={{
            opacity: headOpacity,
            transform: `translateY(${headY}px)`,
            textAlign: "center",
            padding: "0 56px",
            fontFamily: fontDisplay,
            fontWeight: 600,
            fontSize: vertical ? 46 : 50,
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
            fontSize: vertical ? 20 : 20,
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
            marginTop: 36,
            background: "#FFFFFF",
            color: "#3D2FE0",
            fontFamily: fontBody,
            fontWeight: 700,
            fontSize: 19,
            borderRadius: 999,
            padding: "17px 46px",
            boxShadow: `0 14px 40px rgba(0,0,0,0.35), 0 0 ${glowSpread}px rgba(232,207,154,${glowAlpha})`,
          }}
        >
          Try Takda
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
