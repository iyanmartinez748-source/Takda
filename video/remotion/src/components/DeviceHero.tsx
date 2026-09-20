import React from "react";
import { useCurrentFrame, useVideoConfig, spring } from "remotion";
import { PhoneMockup, LaptopMockup } from "./DeviceMockups";
import { fontDisplay } from "../fonts";
import { colors } from "../theme";
import type { Orientation } from "../types";

// Shared layout for the three "show the real UI inside a device" scenes
// (Subjects / Activities / Deadlines): a headline plus a phone (vertical)
// or laptop (landscape) mockup that scales/rises in together.
export function DeviceHero({
  orientation,
  active,
  headline,
  screen,
}: {
  orientation: Orientation;
  active: string;
  headline: string;
  screen: (screenFrame: number, compact: boolean) => React.ReactNode;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame, fps, config: { damping: 16, mass: 0.8 } });
  const scale = 0.82 + Math.min(1, p) * 0.18;
  const opacity = Math.min(1, p * 1.6);
  const y = (1 - Math.min(1, p)) * 30;

  const headP = spring({ frame: frame - 4, fps, config: { damping: 15, mass: 0.6 } });
  const headOpacity = Math.max(0, Math.min(1, headP));
  const headY = (1 - Math.max(0, headP)) * 14;

  const vertical = orientation === "vertical";

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: vertical ? "column" : "row",
        alignItems: "center",
        justifyContent: "center",
        gap: vertical ? 48 : 90,
        padding: vertical ? "0 60px" : "0 100px",
      }}
    >
      <div
        style={{
          opacity: headOpacity,
          transform: `translateY(${headY}px)`,
          textAlign: vertical ? "center" : "left",
          maxWidth: vertical ? "100%" : 460,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            fontFamily: fontDisplay,
            fontWeight: 600,
            fontSize: vertical ? 44 : 52,
            color: colors.ink,
            lineHeight: 1.15,
          }}
        >
          {headline}
        </div>
      </div>

      <div style={{ opacity, transform: `translateY(${y}px) scale(${scale})` }}>
        {vertical ? (
          <PhoneMockup width={360}>{screen(frame, true)}</PhoneMockup>
        ) : (
          <LaptopMockup width={760}>{screen(frame, false)}</LaptopMockup>
        )}
      </div>
    </div>
  );
}
