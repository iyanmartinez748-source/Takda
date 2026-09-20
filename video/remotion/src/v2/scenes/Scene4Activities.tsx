import React from "react";
import { AbsoluteFill } from "remotion";
import { GradientBackground } from "../../components/GradientBackground";
import { DeviceHeroV2 } from "../ui/DeviceHeroV2";
import { AppFrame } from "../../components/ui/AppFrame";
import { ActivitiesScreenV2 } from "../ui/ActivitiesScreenV2";
import type { Orientation } from "../../types";

// SFX cues: UI tap/click — task selected; task checkbox tick — completion
// sound (timeline.ts audioCues, synced to ActivitiesScreenV2's TAP_FRAME/CHECK_FRAME).
export function Scene4Activities({ orientation }: { orientation: Orientation }) {
  return (
    <AbsoluteFill>
      <GradientBackground variant="light" />
      <DeviceHeroV2
        orientation={orientation}
        headline="Know exactly what you need to do."
        screen={(frame, compact) => (
          <AppFrame active="activities" compact={compact}>
            <ActivitiesScreenV2 frame={frame} compact={compact} />
          </AppFrame>
        )}
      />
    </AbsoluteFill>
  );
}
