// remotion/VideoWithCaptions.tsx
import React from "react";
import {
  AbsoluteFill,
  Img,
  interpolate,
  Video as RemotionVideo,
  Sequence,
  useCurrentFrame,
} from "remotion";

export const fps = 30;

export type CaptionSegment = { start: number; end: number; text: string };
export type CaptionStylePreset = "bottom" | "top" | "karaoke";

export type BRollEntry = {
  id: string;
  src: string;
  thumb?: string;
  type?: "image" | "video";
  startSeconds: number;
  durationSeconds: number;
};

type Props = {
  videoSrc: string;
  captions: CaptionSegment[];
  stylePreset?: CaptionStylePreset;
  bRolls?: BRollEntry[];
};

const CaptionsRenderer: React.FC<{
  captions: CaptionSegment[];
  fps: number;
  stylePreset?: CaptionStylePreset;
}> = ({ captions, fps, stylePreset }) => {
  const frame = useCurrentFrame();
  const time = frame / fps;
  const active = captions.find((c) => time >= c.start && time <= c.end);
  if (!active) return null;

  const baseStyle: React.CSSProperties = {
    position: "absolute",
    left: 40,
    right: 40,
    pointerEvents: "none",
    textAlign: "center",
    fontSize: 36,
    fontWeight: 600,
    textShadow: "0 4px 18px rgba(0,0,0,0.6)",
    lineHeight: 1.2,
    zIndex: 50,
  };

  if (stylePreset === "top") {
    return (
      <div style={{ ...baseStyle, top: 20 }}>
        <div
          style={{
            display: "inline-block",
            padding: "8px 16px",
            background: "rgba(0,0,0,0.6)",
            borderRadius: 6,
          }}
        >
          <span style={{ color: "white", fontSize: 28 }}>{active.text}</span>
        </div>
      </div>
    );
  }

  if (stylePreset === "karaoke") {
    return (
      <div style={{ ...baseStyle, bottom: 50 }}>
        <div
          style={{
            display: "inline-block",
            padding: "8px 12px",
            background: "rgba(0,0,0,0.4)",
            borderRadius: 6,
          }}
        >
          <span style={{ color: "white" }}>{active.text}</span>
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...baseStyle, bottom: 60 }}>
      <div
        style={{
          display: "inline-block",
          padding: "10px 18px",
          background: "rgba(0,0,0,0.5)",
          borderRadius: 8,
        }}
      >
        <span style={{ color: "white" }}>{active.text}</span>
      </div>
    </div>
  );
};

/* ---------------- Helpers ---------------- */
const useLocalSeqFrame = () => useCurrentFrame();

const isPublicHttpUrl = (u?: string) => {
  if (!u) return false;
  try {
    const parsed = new URL(u);
    return (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      !parsed.hostname.startsWith("127.") &&
      parsed.hostname !== "localhost"
    );
  } catch {
    return false;
  }
};

const isLikelyLocalBrollUrl = (u?: string) => {
  if (!u) return false;
  try {
    const parsed = new URL(u);
    return (
      parsed.hostname.startsWith("127.") ||
      parsed.hostname === "localhost" ||
      parsed.pathname.includes("/broll/")
    );
  } catch {
    return false;
  }
};

/* ---------------- B-roll renderers ---------------- */
const ImageBroll: React.FC<{ src: string; durationInFrames: number }> = ({
  src,
  durationInFrames,
}) => {
  const frame = useLocalSeqFrame();
  const inFrames = Math.min(10, Math.round(durationInFrames * 0.15));
  const outFrames = Math.min(10, Math.round(durationInFrames * 0.15));
  let opacity = 1;
  if (frame < inFrames) {
    opacity = interpolate(frame, [0, inFrames], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
  } else if (frame >= durationInFrames - outFrames) {
    opacity = interpolate(
      frame,
      [durationInFrames - outFrames, durationInFrames],
      [1, 0],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
    );
  }
  const zoom =
    1 + Math.sin((frame / Math.max(1, durationInFrames)) * Math.PI) * 0.02;
  return (
    <AbsoluteFill style={{ opacity }}>
      <Img
        src={src}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: `scale(${zoom})`,
        }}
      />
    </AbsoluteFill>
  );
};

const VideoBroll: React.FC<{
  src: string;
  poster?: string;
  durationInFrames: number;
}> = ({ src, poster, durationInFrames }) => {
  const frame = useLocalSeqFrame();
  const inFrames = Math.min(8, Math.round(durationInFrames * 0.12));
  const outFrames = Math.min(8, Math.round(durationInFrames * 0.12));
  let opacity = 1;
  if (frame < inFrames) {
    opacity = interpolate(frame, [0, inFrames], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
  } else if (frame >= durationInFrames - outFrames) {
    opacity = interpolate(
      frame,
      [durationInFrames - outFrames, durationInFrames],
      [1, 0],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
    );
  }

  return (
    <AbsoluteFill style={{ opacity }}>
      <RemotionVideo
        src={src}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
    </AbsoluteFill>
  );
};

/* ---------------- Main component ---------------- */
export const VideoWithCaptions: React.FC<Props> = ({
  videoSrc,
  captions,
  stylePreset = "bottom",
  bRolls = [],
}) => {
  return (
    <AbsoluteFill style={{ background: "black", overflow: "hidden" }}>
      {/* base video */}
      <AbsoluteFill>
        <RemotionVideo
          src={videoSrc}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </AbsoluteFill>

      {/* b-roll sequences */}
      {Array.isArray(bRolls) &&
        bRolls.map((b) => {
          const startFrame = Math.round((b.startSeconds || 0) * fps);
          const durationInFrames = Math.max(
            1,
            Math.round((b.durationSeconds || 0.1) * fps)
          );
          const type = (b.type as "image" | "video") || "image";

          return (
            <Sequence
              key={b.id}
              from={startFrame}
              durationInFrames={durationInFrames}
            >
              <AbsoluteFill
                style={{ justifyContent: "center", alignItems: "center" }}
              >
                {type === "video" ? (
                  <VideoBroll
                    src={b.src}
                    poster={b.thumb}
                    durationInFrames={durationInFrames}
                  />
                ) : (
                  <ImageBroll src={b.src} durationInFrames={durationInFrames} />
                )}
              </AbsoluteFill>
            </Sequence>
          );
        })}

      {/* captions on top */}
      <CaptionsRenderer
        captions={captions || []}
        fps={fps}
        stylePreset={stylePreset}
      />
    </AbsoluteFill>
  );
};

export default VideoWithCaptions;
