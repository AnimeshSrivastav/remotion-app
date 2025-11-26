// remotion/Root.tsx
import React from "react";
import { Composition, getInputProps } from "remotion";
import {
  VideoWithCaptions,
  fps,
  CaptionSegment,
  CaptionStylePreset,
  BRollEntry,
} from "./VideoWithCaptions";

type InputProps = {
  videoSrc: string;
  captions: CaptionSegment[];
  bRolls: BRollEntry[];
  stylePreset: CaptionStylePreset;
  durationInSeconds?: number;
};

export const RemotionRoot: React.FC = () => {
  const inputProps = getInputProps<InputProps>(); // 👈 Remotion gives props here

  const durationInSeconds = inputProps?.durationInSeconds ?? 60;
  const durationInFrames = Math.max(1, Math.round(durationInSeconds * fps));

  return (
    <Composition
      id="VideoWithCaptions"
      component={VideoWithCaptions}
      width={1920}
      height={1080}
      fps={fps}
      durationInFrames={durationInFrames}
      defaultProps={{
        videoSrc: inputProps?.videoSrc ?? "",
        captions: inputProps?.captions ?? [],
        bRolls: inputProps?.bRolls ?? [],
        stylePreset: inputProps?.stylePreset ?? "bottom",
      }}
    />
  );
};
