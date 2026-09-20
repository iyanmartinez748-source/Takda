import React from "react";
import { AbsoluteFill } from "remotion";
import { GradientBackground } from "../components/GradientBackground";
import { DeviceHero } from "../components/DeviceHero";
import { AppFrame } from "../components/ui/AppFrame";
import { ActivitiesScreen } from "../components/ui/ActivitiesScreen";
import type { Orientation } from "../types";

// SFX cues: task checkbox tick — completion sound, x2 (timeline.ts audioCues,
// synced to ActivitiesScreen's TASKS[].checkAt frames).
export function Scene4Activities({ orientation }: { orientation: Orientation }) {
  return (
    <AbsoluteFill>
      <GradientBackground variant="light" />
      <DeviceHero
        orientation={orientation}
        active="activities"
        headline="Know exactly what you need to do."
        screen={(frame, compact) => (
          <AppFrame active="activities" compact={compact}>
            <ActivitiesScreen frame={frame} compact={compact} />
          </AppFrame>
        )}
      />
    </AbsoluteFill>
  );
}
