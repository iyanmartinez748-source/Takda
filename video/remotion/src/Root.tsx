import React from "react";
import { Composition } from "remotion";
import { Commercial } from "./Commercial";
import { FPS, TOTAL_DURATION } from "./timeline";

export const RemotionRoot: React.FC = () => {
  return (
    <>
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
    </>
  );
};
