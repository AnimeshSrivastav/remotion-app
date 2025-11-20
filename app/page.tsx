// app/page.tsx
"use client";

import { useState } from "react";
import { Player } from "@remotion/player";
import {
  VideoWithCaptions,
  CaptionSegment,
  fps,
} from "../remotion/VideoWithCaptions";
import type { CaptionStylePreset } from "../remotion/VideoWithCaptions";

export default function HomePage() {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [captions, setCaptions] = useState<CaptionSegment[]>([]);
  const [stylePreset, setStylePreset] = useState<CaptionStylePreset>("bottom");
  const [durationInSeconds, setDurationInSeconds] = useState<number>(60);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setVideoFile(file);
    const url = URL.createObjectURL(file);
    setVideoUrl(url);

    const video = document.createElement("video");
    video.src = url;
    video.onloadedmetadata = () => {
      setDurationInSeconds(video.duration || 60);
    };
  };

  const handleGenerateCaptions = async () => {
    if (!videoFile) return;
    setIsGenerating(true);
    const formData = new FormData();
    formData.append("file", videoFile);

    const res = await fetch("/api/generate-captions", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();
    setIsGenerating(false);
    if (data.success) {
      setCaptions(data.captions); // expect array of {start,end,text}
    } else {
      alert("Failed to generate captions: " + data.error);
    }
  };

  const handleExport = async () => {
    if (!videoFile || captions.length === 0) return;

    const formData = new FormData();
    formData.append("file", videoFile);
    formData.append("captions", JSON.stringify(captions));
    formData.append("stylePreset", stylePreset);
    formData.append("durationInSeconds", String(durationInSeconds));

    const res = await fetch("/api/render", {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      const errorJson = await res.json().catch(() => null);
      alert(
        "Render failed: " +
          (errorJson?.error || `${res.status} ${res.statusText}`)
      );
      return;
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "captioned.mp4";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900 text-slate-50 flex justify-center px-4 py-10">
      <div className="w-full max-w-6xl space-y-8">
        {/* Header */}
        <header className="space-y-3 text-center md:text-left">
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
            Remotion Auto-Captioner
          </h1>
          <p className="text-sm md:text-base text-slate-300/90 max-w-7xl mx-auto md:mx-0">
            Upload an MP4, auto-generate captions using Whisper, pick a style,
            preview in real-time, and export the final video.
          </p>
        </header>

        {/* Main layout */}
        <section className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)] items-start">
          {/* Left column: controls + captions */}
          <div className="space-y-4">
            {/* Upload + generate card */}
            <div className="rounded-2xl border border-slate-700/70 bg-slate-900/50 backdrop-blur-xl p-5 shadow-xl shadow-slate-950/40 space-y-4">
              <div className="space-y-1.5">
                <h2 className="text-lg font-semibold">1. Upload video</h2>
                <p className="text-xs text-slate-400/90">
                  Supported: <span className="font-medium">.mp4</span> files
                  only.
                </p>
              </div>

              <label className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-700/70 bg-slate-900/60 backdrop-blur-lg px-4 py-6 text-center hover:border-sky-400/70 hover:bg-slate-900/70 transition">
                <span className="text-sm font-medium line-clamp-1">
                  {videoFile ? videoFile.name : "Click to choose a video file"}
                </span>
                <span className="text-xs text-slate-400/90">
                  Or drag &amp; drop into this area
                </span>
                <input
                  type="file"
                  accept="video/mp4"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>

              <div className="flex flex-col sm:flex-row gap-3 sm:items-end sm:justify-between">
                {/* Style presets */}
                <div className="flex flex-col gap-1 w-full sm:w-auto">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400/90">
                    Caption style
                  </span>
                  <select
                    value={stylePreset}
                    onChange={(e) =>
                      setStylePreset(e.target.value as CaptionStylePreset)
                    }
                    className="w-full sm:w-56 rounded-lg border border-slate-700/80 bg-slate-900/70 backdrop-blur-lg px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500/80"
                  >
                    <option value="bottom">Bottom</option>
                    <option value="top">Top bar</option>
                    <option value="karaoke">Karaoke</option>
                  </select>
                </div>

                {/* Generate button */}
                <button
                  className="w-full sm:w-auto px-4 py-2 rounded-lg bg-sky-500/90 hover:bg-sky-400 disabled:bg-slate-700 text-sm font-medium transition shadow-md shadow-sky-500/40 disabled:shadow-none"
                  disabled={!videoFile || isGenerating}
                  onClick={handleGenerateCaptions}
                >
                  {isGenerating
                    ? "Generating captions..."
                    : "Auto-generate captions"}
                </button>
              </div>
            </div>

            {/* Captions editor card */}
            <div className="rounded-2xl border border-slate-700/70 bg-slate-900/50 backdrop-blur-xl p-5 shadow-xl shadow-slate-950/40 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-semibold">
                  2. Review &amp; edit captions
                </h2>
                <span className="text-[11px] px-2 py-1 rounded-full bg-slate-800/80 text-slate-300 border border-slate-700/70">
                  Advanced (JSON)
                </span>
              </div>
              <p className="text-xs text-slate-400/90">
                Edit the caption data directly in JSON format.
              </p>
              <textarea
                className="mt-2 w-full h-44 text-xs md:text-sm text-slate-100 bg-slate-950/80 border border-slate-800 rounded-xl p-3 font-mono resize-none outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500/80"
                value={JSON.stringify(captions, null, 2)}
                onChange={(e) => {
                  try {
                    const parsed = JSON.parse(e.target.value);
                    setCaptions(parsed);
                  } catch {}
                }}
              />
            </div>

            {/* Export button */}
            <div className="flex justify-end">
              <button
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-emerald-500/90 hover:bg-emerald-400 disabled:bg-slate-700 text-sm font-semibold shadow-md shadow-emerald-500/40 transition disabled:shadow-none"
                disabled={!videoFile || captions.length === 0}
                onClick={handleExport}
              >
                Export video
              </button>
            </div>
          </div>

          {/* Right column: preview */}
          <div className="rounded-2xl border border-slate-700/70 bg-slate-900/50 backdrop-blur-xl p-5 shadow-xl shadow-slate-950/40">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">3. Live preview</h2>
            </div>

            {videoUrl ? (
              <div className="w-full rounded-xl overflow-hidden bg-black/90 border border-slate-800/80">
                <Player
                  component={VideoWithCaptions}
                  inputProps={{
                    videoSrc: videoUrl,
                    captions,
                    stylePreset,
                  }}
                  durationInFrames={Math.round(durationInSeconds * fps)}
                  fps={fps}
                  compositionWidth={1920}
                  compositionHeight={1080}
                  autoPlay
                  controls
                  style={{
                    width: "100%",
                    height: "auto",
                    aspectRatio: "16 / 9",
                  }}
                />
              </div>
            ) : (
              <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-slate-700/70 bg-slate-950/80 backdrop-blur-lg text-center text-sm text-slate-500">
                Upload a video to see the preview here.
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
