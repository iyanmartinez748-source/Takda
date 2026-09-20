import React from "react";
import { AbsoluteFill } from "remotion";
import { GradientBackground } from "../../components/GradientBackground";
import { DeviceHeroV2 } from "../ui/DeviceHeroV2";
import { AppFrame } from "../../components/ui/AppFrame";
import { CalendarScreenV2 } from "../ui/CalendarScreenV2";
import type { Orientation } from "../../types";

// SFX cues: calendar date highlight — soft pulse tick; notification ping —
// deadline callout; soft whoosh — upcoming list slides in (timeline.ts audioCues).
export function Scene5Deadlines({ orientation }: { orientation: Orientation }) {
  return (
    <AbsoluteFill>
      <GradientBackground variant="light" />
      <DeviceHeroV2
        orientation={orientation}
        headline="Never lose track of a deadline."
        screen={(frame, compact) => (
          <AppFrame active="calendar" compact={compact}>
            <CalendarScreenV2 frame={frame} compact={compact} />
          </AppFrame>
        )}
      />
    </AbsoluteFill>
  );
}
