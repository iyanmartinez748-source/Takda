import React from "react";
import { Composition } from "remotion";
import { Commercial } from "./Commercial";
import { FPS, TOTAL_DURATION } from "./timeline";
import { CommercialV2 } from "./v2/Commercial";
import { FPS as FPS_V2, TOTAL_DURATION as TOTAL_DURATION_V2 } from "./v2/timeline";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* V1 — untouched */}
      <Composition
        id="TakdaVertical"
        component={Commercial}
        durationInFrames={TOTAL_DURATION}
        fps={FPS}
        width={1080}
        height={1920}
        defaultProps={{ orientation: "vertical" }}
      />
      <Composition
        id="TakdaLandscape"
        component={Commercial}
        durationInFrames={TOTAL_DURATION}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{ orientation: "landscape" }}
      />

      {/* V2 — separate compositions/output files, for side-by-side review against V1 */}
      <Composition
        id="TakdaCommercialV2Vertical"
        component={CommercialV2}
        durationInFrames={TOTAL_DURATION_V2}
        fps={FPS_V2}
        width={1080}
        height={1920}
        defaultProps={{ orientation: "vertical" }}
      />
      <Composition
        id="TakdaCommercialV2Landscape"
        component={CommercialV2}
        durationInFrames={TOTAL_DURATION_V2}
        fps={FPS_V2}
        width={1920}
        height={1080}
        defaultProps={{ orientation: "landscape" }}
      />
    </>
  );
};
