import React from "react";
import { AbsoluteFill } from "remotion";
import { GradientBackground } from "../components/GradientBackground";
import { DeviceHero } from "../components/DeviceHero";
import { AppFrame } from "../components/ui/AppFrame";
import { CalendarScreen } from "../components/ui/CalendarScreen";
import type { Orientation } from "../types";

// SFX cue: calendar notification — notification ping (timeline.ts audioCues,
// synced to CalendarScreen's toast entrance at local frame 26).
export function Scene5Deadlines({ orientation }: { orientation: Orientation }) {
  return (
    <AbsoluteFill>
      <GradientBackground variant="light" />
      <DeviceHero
        orientation={orientation}
        active="calendar"
        headline="Never lose track of a deadline."
        screen={(frame, compact) => (
          <AppFrame active="calendar" compact={compact}>
            <CalendarScreen frame={frame} compact={compact} />
          </AppFrame>
        )}
      />
    </AbsoluteFill>
  );
}
