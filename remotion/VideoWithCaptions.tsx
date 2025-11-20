import { AbsoluteFill, useCurrentFrame, Video } from "remotion";

export type CaptionSegment = {
  start: number;
  end: number;
  text: string;
};

export type CaptionStylePreset = "bottom" | "top" | "karaoke";

export const fps = 30;

type Props = {
  videoSrc: string;
  captions: CaptionSegment[];
  stylePreset: CaptionStylePreset;
};

export const VideoWithCaptions: React.FC<Props> = ({
  videoSrc,
  captions,
  stylePreset,
}) => {
  const frame = useCurrentFrame();
  // console.log("frame", frame);
  const currentTime = frame / fps;

  return (
    <AbsoluteFill className="bg-black">
      <Video src={videoSrc} />
      {stylePreset !== "karaoke" && (
        <div
          style={{
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            bottom: stylePreset === "bottom" ? 60 : "auto",
            top: stylePreset === "top" ? 40 : "auto",
            maxWidth: "80%",
            textAlign: "center",
            padding: "8px 16px",
            borderRadius: 12,
            background:
              stylePreset === "top" ? "rgba(0,0,0,0.7)" : "rgba(0,0,0,0.6)",
            color: "white",
            fontFamily: `"Noto Sans", "Noto Sans Devanagari", system-ui`,
            fontSize: 32,
            lineHeight: 1.3,
          }}
        >
          {captions
            .filter((seg) => currentTime >= seg.start && currentTime <= seg.end)
            .map((seg, i) => (
              <div key={i}>{seg.text}</div>
            ))}
        </div>
      )}

      {stylePreset === "karaoke" && (
        <div
          style={{
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            bottom: 60,
            maxWidth: "80%",
            textAlign: "center",
            padding: "8px 16px",
            borderRadius: 12,
            background: "rgba(0,0,0,0.8)",
            color: "white",
            fontFamily: `"Noto Sans", "Noto Sans Devanagari", system-ui`,
            fontSize: 32,
            lineHeight: 1.3,
          }}
        >
          {captions.map((seg, i) => {
            const isActive = currentTime >= seg.start && currentTime <= seg.end;
            return (
              <span
                key={i}
                style={{
                  marginRight: 8,
                  color: isActive ? "#ffeb3b" : "rgba(255,255,255,0.6)",
                }}
              >
                {seg.text}
              </span>
            );
          })}
        </div>
      )}
    </AbsoluteFill>
  );
};
