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
        "Cloud export failed (likely due to time/memory limits on the free backend).\n\n" +
          "Export works locally or via Docker as described in the README.\n\n" +
          "Details: " +
          errorJson?.error
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
    <main className="relative min-h-screen overflow-hidden bg-[linear-gradient(to_bottom,_#0f0f11_0%,_#050509_100%)] text-[#e6e6e6] flex justify-center px-4 py-10">
      {/* existing scan-line waves */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden opacity-[0.15]">
        <div className="absolute top-1/3 left-1/2 w-[200%] h-[200px] -translate-x-1/2 bg-[linear-gradient(90deg,_rgba(255,255,255,0.06)_0%,_rgba(255,255,255,0.02)_50%,_rgba(255,255,255,0.06)_100%)] animate-darkWave" />
      </div>

      <div className="pointer-events-none absolute inset-0 -z-10 opacity-[0.07]">
        <div className="absolute top-1/3 left-1/2 w-[200%] h-[160px] -translate-x-1/2 bg-[linear-gradient(90deg,rgba(255,255,255,0.25)_0%,rgba(255,255,255,0.02)_50%,rgba(255,255,255,0.25)_100%)] blur-3xl animate-softWave" />
      </div>

      {/* subtle background glows */}
      <div className="pointer-events-none absolute -z-10 -right-24 top-10 h-64 w-64 rounded-full bg-[radial-gradient(circle_at_30%_0%,rgba(56,189,248,0.45),transparent_60%)] blur-3xl opacity-80" />
      <div className="pointer-events-none absolute -z-10 -left-32 bottom-0 h-80 w-80 rounded-full bg-[radial-gradient(circle_at_70%_100%,rgba(236,72,153,0.55),transparent_60%)] blur-3xl opacity-80" />

      <div className="w-full max-w-6xl space-y-8 animate-fade-in-slow">
        {/* Header */}
        <header className="space-y-3 text-center md:text-left">
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
            Remotion Auto-Captioner
          </h1>
          <p className="text-sm md:text-base text-slate-300/90 max-w-3xl mx-auto md:mx-0">
            Upload an MP4, auto-generate captions using Whisper, fine-tune the
            styling, preview instantly, and export a ready-to-share video.
          </p>
        </header>

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1.45fr)] items-start">
          <div className="space-y-4">
            <div className="rounded-2xl border border-[#252528] bg-[rgba(20,20,22,0.82)] backdrop-blur-2xl shadow-[0_18px_60px_rgba(0,0,0,0.7)] p-5 transition-transform duration-300 motion-safe:hover:-translate-y-0.5">
              <div className="space-y-1.5 mb-4">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-indigo-400/15 text-[11px] text-indigo-100 border border-indigo-400/50">
                    1
                  </span>
                  Upload video
                </h2>
                <p className="text-xs text-slate-300/80">
                  Supported: <span className="font-medium">.mp4</span> files
                  only.
                </p>
              </div>

              <label className="group relative flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[#3a3a3d] bg-[#161617]/70 hover:bg-[#18181a]/90 transition p-6 text-[#d4d4d4] cursor-pointer overflow-hidden">
                <div className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 bg-[radial-gradient(circle_at_top_left,rgba(236,72,153,0.22),transparent_55%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.22),transparent_55%)] transition-opacity duration-500" />
                <span className="relative text-sm font-medium line-clamp-1">
                  {videoFile ? videoFile.name : "Click to choose a video file"}
                </span>
                <span className="relative text-xs text-slate-400/90">
                  Or drag &amp; drop into this area
                </span>
                <input
                  type="file"
                  accept="video/mp4"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>

              <div className="mt-4 flex flex-col sm:flex-row gap-3 sm:items-end sm:justify-between">
                <div className="flex flex-col gap-1 w-full sm:w-auto">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400/90">
                    Caption style
                  </span>
                  <div className="relative rounded-lg bg-[linear-gradient(135deg,rgba(148,163,184,0.5),rgba(15,23,42,0.9))] p-[1px]">
                    <div className="relative rounded-[0.6rem] bg-[#101013]">
                      <select
                        value={stylePreset}
                        onChange={(e) =>
                          setStylePreset(e.target.value as CaptionStylePreset)
                        }
                        className="w-full rounded-[0.55rem] border border-[#29292d] bg-[#111114] text-[#e6e6e6] px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#050509] transition"
                      >
                        <option value="bottom">Bottom</option>
                        <option value="top">Top bar</option>
                        <option value="karaoke">Karaoke</option>
                      </select>
                    </div>
                  </div>
                </div>

                <button
                  className="relative inline-flex items-center justify-center w-full sm:w-auto rounded-lg px-4 py-2 text-sm font-medium text-slate-50 overflow-hidden disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#050509] transition-shadow duration-300 shadow-[0_10px_35px_rgba(15,23,42,0.8)] hover:shadow-[0_16px_55px_rgba(15,23,42,0.95)]"
                  disabled={!videoFile || isGenerating}
                  onClick={handleGenerateCaptions}
                >
                  <span className="absolute inset-0 bg-[linear-gradient(135deg,#f97316,#ec4899,#6366f1)] bg-[length:160%_160%] animate-button-gradient" />
                  <span className="absolute inset-0 rounded-lg border border-white/20 mix-blend-soft-light" />
                  <span className="relative flex items-center gap-2">
                    {isGenerating ? (
                      <>
                        <span className="h-3 w-3 rounded-full border-2 border-slate-900/40 border-t-slate-100 animate-spin" />
                        Generating captions...
                      </>
                    ) : (
                      <>Auto-generate captions</>
                    )}
                  </span>
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-[#252528] bg-[rgba(20,20,22,0.82)] backdrop-blur-2xl shadow-[0_18px_60px_rgba(0,0,0,0.7)] p-5 transition-transform duration-300 motion-safe:hover:-translate-y-0.5">
              <div className="flex items-center justify-between gap-2 mb-2.5">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-sky-400/15 text-[11px] text-sky-100 border border-sky-400/50">
                    2
                  </span>
                  Review &amp; edit captions
                </h2>
                <span className="text-[11px] px-2 py-1 rounded-full bg-slate-900/85 text-slate-300 border border-white/10 shadow-sm shadow-black/40">
                  Advanced · JSON
                </span>
              </div>
              <p className="text-xs text-slate-300/80 mb-3">
                Edit the caption data directly in JSON format.
              </p>
              <textarea
                className="w-full h-44 bg-[#121214] border border-[#2a2a2d] text-[#dcdcdc] rounded-xl p-3 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400/75 focus-visible:ring-offset-2 focus-visible:ring-offset-[#050509] shadow-inner shadow-black/40"
                value={JSON.stringify(captions, null, 2)}
                onChange={(e) => {
                  try {
                    const parsed = JSON.parse(e.target.value);
                    setCaptions(parsed);
                  } catch {
                    // ignore invalid JSON while typing
                  }
                }}
              />
            </div>

            <div className="flex justify-end">
              <button
                className="group relative w-full sm:w-auto inline-flex items-center justify-center px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-50 overflow-hidden disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#050509] shadow-[0_16px_50px_rgba(88,28,135,0.85)] hover:shadow-[0_22px_70px_rgba(88,28,135,1)] transition-shadow duration-300"
                disabled={!videoFile || captions.length === 0}
                onClick={handleExport}
              >
                <span className="absolute inset-0 bg-[linear-gradient(140deg,#fb923c,#ec4899,#6366f1)] bg-[length:150%_150%] animate-button-gradient-slow" />
                <span className="absolute inset-0 rounded-xl border border-white/15" />
                <span className="relative flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-100 shadow-[0_0_14px_rgba(251,113,133,0.9)]" />
                  Export video
                </span>
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-[#252528] bg-[rgba(20,20,22,0.9)] backdrop-blur-2xl shadow-[0_22px_70px_rgba(0,0,0,0.8)] p-5 transition-transform duration-300 motion-safe:hover:-translate-y-0.5 motion-safe:hover:rotate-[0.15deg]">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-fuchsia-400/12 text-[11px] text-fuchsia-200 border border-fuchsia-400/40">
                  3
                </span>
                Live preview
              </h2>
              {videoUrl && (
                <span className="text-[11px] px-2 py-1 rounded-full bg-slate-900/90 text-slate-200 border border-white/10 flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-pink-400 animate-pulse" />
                  Duration: ~{Math.round(durationInSeconds)}s
                </span>
              )}
            </div>

            {videoUrl ? (
              <div className="w-full rounded-xl overflow-hidden bg-black/90 border border-slate-800/80 shadow-[0_18px_60px_rgba(0,0,0,0.9)] animate-card-rise">
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
                  controls
                  style={{
                    width: "100%",
                    height: "auto",
                    aspectRatio: "16 / 9",
                  }}
                />
              </div>
            ) : (
              <div className="flex h-64 items-center justify-center rounded-xl overflow-hidden bg-[#0f0f11] border border-[#2d2d30] shadow-[0_10px_40px_rgba(0,0,0,0.5)] text-center text-sm text-slate-500 animate-pulse-subtle">
                Upload a video to see the preview here.
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
