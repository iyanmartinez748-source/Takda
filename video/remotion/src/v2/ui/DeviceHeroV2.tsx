import React from "react";
import { useCurrentFrame, useVideoConfig, spring } from "remotion";
import { PhoneMockup, LaptopMockup } from "../../components/DeviceMockups";
import { fontDisplay } from "../../fonts";
import { colors } from "../../theme";
import type { Orientation } from "../../types";

// V2's headline+device layout: larger devices, more center-of-frame usage,
// bigger vertical type — addressing V1's "too much unused vertical space"
// note. Vertical stacks headline-over-device like V1 did, but both are
// sized up and pulled toward the vertical center third instead of the
// headline sitting alone in the top of the frame.
export function DeviceHeroV2({
  orientation,
  headline,
  screen,
}: {
  orientation: Orientation;
  headline: string;
  screen: (frame: number, compact: boolean) => React.ReactNode;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame, fps, config: { damping: 15, mass: 0.8 } });
  const scale = 0.85 + Math.min(1, p) * 0.15;
  const opacity = Math.min(1, p * 1.6);
  const y = (1 - Math.min(1, p)) * 26;

  const headP = spring({ frame: frame - 3, fps, config: { damping: 15, mass: 0.6 } });
  const headOpacity = Math.max(0, Math.min(1, headP));
  const headY = (1 - Math.max(0, headP)) * 16;

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
        gap: vertical ? 40 : 90,
        padding: vertical ? "0 48px" : "0 90px",
      }}
    >
      <div
        style={{
          opacity: headOpacity,
          transform: `translateY(${headY}px)`,
          textAlign: vertical ? "center" : "left",
          maxWidth: vertical ? "100%" : 480,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            fontFamily: fontDisplay,
            fontWeight: 600,
            fontSize: vertical ? 52 : 54,
            color: colors.ink,
            lineHeight: 1.12,
          }}
        >
          {headline}
        </div>
      </div>

      <div style={{ opacity, transform: `translateY(${y}px) scale(${scale})` }}>
        {vertical ? (
          <PhoneMockup width={460}>{screen(frame, true)}</PhoneMockup>
        ) : (
          <LaptopMockup width={800}>{screen(frame, false)}</LaptopMockup>
        )}
      </div>
    </div>
  );
}
