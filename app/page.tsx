// app/page.tsx
"use client";

import { Player } from "@remotion/player";
import { useEffect, useState } from "react";
import type { CaptionStylePreset } from "../remotion/VideoWithCaptions";
import {
  CaptionSegment,
  fps,
  VideoWithCaptions,
} from "../remotion/VideoWithCaptions";

type BRollEntry = {
  id: string;
  src: string; // remote URL (Pexels) or later server-served /broll URL
  thumb?: string; // small preview image
  type: "image" | "video";
  startSeconds: number;
  durationSeconds: number;
};

export default function HomePage() {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoWidth, setVideoWidth] = useState<number | null>(null);
  const [videoHeight, setVideoHeight] = useState<number | null>(null);
  const [captions, setCaptions] = useState<CaptionSegment[]>([]);
  const [stylePreset, setStylePreset] = useState<CaptionStylePreset>("bottom");
  const [durationInSeconds, setDurationInSeconds] = useState<number>(60);
  const [isGenerating, setIsGenerating] = useState(false);
  const [allImages, setAllImages] = useState<string[]>([]);

  // Search states
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<
    {
      id: number | string;
      src: string;
      thumb?: string;
      type: "image" | "video";
      meta?: any;
    }[]
  >([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchType, setSearchType] = useState<"photos" | "videos">("photos");

  // B-roll states
  const [bRolls, setBRolls] = useState<BRollEntry[]>([]);
  const [selectedForBRoll, setSelectedForBRoll] = useState<{
    src: string;
    thumb?: string;
    type: "image" | "video";
  } | null>(null);
  const [brStartSeconds, setBrStartSeconds] = useState<number>(0);
  const [brDurationSeconds, setBrDurationSeconds] = useState<number>(4);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Configure maximum allowed dimensions
    const MAX_WIDTH = 1920;
    const MAX_HEIGHT = 1080;

    // store file and create object URL
    setVideoFile(file);
    const url = URL.createObjectURL(file);
    setVideoUrl(url);

    // create an offscreen video element to read metadata
    const vid = document.createElement("video");
    vid.preload = "metadata";
    vid.src = url;

    const cleanup = () => {
      vid.onloadedmetadata = null;
      vid.onerror = null;
    };

    const makeEven = (n: number) => (n % 2 === 0 ? n : n - 1); // encoders like even dims

    const applyDimensions = (
      intrinsicWidth: number,
      intrinsicHeight: number,
      duration: number
    ) => {
      // sanitize inputs
      const iw = intrinsicWidth > 0 ? intrinsicWidth : 1920;
      const ih = intrinsicHeight > 0 ? intrinsicHeight : 1080;
      const dur = isFinite(duration) && duration > 0 ? duration : 60;

      // compute scale so both width and height are within limits
      const scaleForWidth = MAX_WIDTH / iw;
      const scaleForHeight = MAX_HEIGHT / ih;
      const scale = Math.min(1, scaleForWidth, scaleForHeight);

      let finalW = Math.max(2, Math.round(iw * scale));
      let finalH = Math.max(2, Math.round(ih * scale));

      // ensure even numbers (helps video encoders)
      finalW = makeEven(finalW);
      finalH = makeEven(finalH);

      setDurationInSeconds(dur);
      setVideoWidth(finalW);
      setVideoHeight(finalH);
    };

    // when metadata loads, capture intrinsic dimensions & duration
    vid.onloadedmetadata = () => {
      try {
        applyDimensions(vid.videoWidth, vid.videoHeight, vid.duration);
      } catch (err) {
        // fallback values in case of strange metadata
        applyDimensions(1920, 1080, 60);
      } finally {
        cleanup();
      }
    };

    // error handler: fallback defaults
    vid.onerror = () => {
      applyDimensions(1920, 1080, 60);
      cleanup();
    };

    // Short timeout fallback for browsers that don't fire loadedmetadata reliably
    setTimeout(() => {
      if (
        !vid.videoWidth ||
        !vid.videoHeight ||
        !isFinite(vid.duration) ||
        vid.duration === 0
      ) {
        applyDimensions(
          vid.videoWidth || 1920,
          vid.videoHeight || 1080,
          isFinite(vid.duration) ? vid.duration : 60
        );
        cleanup();
      }
    }, 250);

    // Note: keep object URL alive — revoke it later when you clear/remove the file:
    // URL.revokeObjectURL(url);
  };

  // --- captions generation (unchanged) ---
  const handleGenerateCaptions = async () => {
    if (!videoFile) return;
    setIsGenerating(true);
    const formData = new FormData();
    formData.append("file", videoFile);
    const res = await fetch("/api/generate-captions", {
      method: "POST",
      body: formData,
    });
    const data = await res
      .json()
      .catch(() => ({ success: false, error: "invalid json" }));
    setIsGenerating(false);
    if (data.success) {
      setCaptions(data.captions);
    } else {
      alert("Failed to generate captions: " + data.error);
    }
  };

  // --- export ---
  const handleExport = async () => {
    if (!videoFile || captions.length === 0) return;
    const formData = new FormData();
    formData.append("file", videoFile);
    // we keep backward compatibility: captions array is sent; to include bRolls we send 'bRolls' field too
    formData.append("captions", JSON.stringify(captions));
    formData.append("stylePreset", stylePreset);
    formData.append("durationInSeconds", String(durationInSeconds));
    formData.append("bRolls", JSON.stringify(bRolls));

    const res = await fetch("/api/render", {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      const errorJson = await res.json().catch(() => null);
      alert(
        "Cloud export failed (likely due to time/memory limits on the free backend server).\n\n" +
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
    // if there are video b-rolls, final output is still mp4
    a.download = "captioned.mp4";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  // --- search (calls server proxy /api/pexels) ---
  const handleSearch = async (page = 1, per_page = 12) => {
    if (!query || query.trim().length === 0) return;
    setIsSearching(true);
    setSearchError(null);
    try {
      const res = await fetch(
        `/api/pexels?query=${encodeURIComponent(
          query
        )}&per_page=${per_page}&page=${page}&type=${searchType}`
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || `Search failed (${res.status})`);
      }
      const json = await res.json();
      // normalize results:
      const normalized = (json.results || []).map((it: any) => ({
        id: it.id,
        src: it.src || it.video || it.link || "",
        thumb: it.thumb || it.src || "",
        type: it.type === "video" ? "video" : "image",
        meta: it.meta || null,
      }));
      setSearchResults(normalized);
    } catch (err: any) {
      setSearchError(err?.message || "Unknown error");
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  // open modal to add b-roll
  const openAddBRollForm = (
    src: string,
    thumb: string | undefined,
    type: "image" | "video"
  ) => {
    const suggestedStart = 0;
    const suggestedDuration =
      type === "video"
        ? Math.min(
            6,
            Math.max(1, Math.round(Math.min(6, durationInSeconds / 6)))
          )
        : Math.min(
            6,
            Math.max(1, Math.round(Math.min(6, durationInSeconds / 10)))
          );
    setSelectedForBRoll({ src, thumb, type });
    setBrStartSeconds(suggestedStart);
    setBrDurationSeconds(suggestedDuration);
  };

  // add to bRolls list
  const handleAddBRoll = () => {
    if (!selectedForBRoll) return;
    const start = Math.max(0, Number(brStartSeconds) || 0);
    const dur = Math.max(0.1, Number(brDurationSeconds) || 1);
    const finalStart = Math.min(start, Math.max(0, durationInSeconds));
    const finalDur = Math.min(
      dur,
      Math.max(0.1, durationInSeconds - finalStart || dur)
    );
    const id = `${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const entry: BRollEntry = {
      id,
      src: selectedForBRoll.src,
      thumb: selectedForBRoll.thumb,
      type: selectedForBRoll.type,
      startSeconds: finalStart,
      durationSeconds: finalDur,
    };
    setBRolls((prev) => [...prev, entry]);

    // ========= FIX: store an image thumbnail into the "selected images" pool =========
    // For videos prefer to store the provided thumb (poster image) so the Selected images
    // grid shows a real image instead of a broken <img> loading the MP4.
    const toStore =
      selectedForBRoll.thumb && selectedForBRoll.type === "video"
        ? selectedForBRoll.thumb
        : selectedForBRoll.src;

    setAllImages((prev) =>
      prev.includes(toStore) ? prev : [toStore, ...prev]
    );
    // ==================================================================================

    setSelectedForBRoll(null);
  };

  const cancelAddBRoll = () => setSelectedForBRoll(null);

  // editor helpers
  const removeBRoll = (id: string) =>
    setBRolls((s) => s.filter((b) => b.id !== id));
  const updateBRoll = (id: string, patch: Partial<BRollEntry>) =>
    setBRolls((s) => s.map((b) => (b.id === id ? { ...b, ...patch } : b)));

  useEffect(() => {}, []);

  // helper: detect if a URL looks like a video file
  const looksLikeVideoFile = (url: string) =>
    /\.(mp4|webm|ogg)(\?.*)?$/i.test(url) || url.includes("/videos/");

  return (
    <main className="relative min-h-screen overflow-hidden bg-[linear-gradient(to_bottom,_#0f0f11_0%,_#050509_100%)] text-[#e6e6e6] flex justify-center px-4 py-10">
      {/* background layers (unchanged) */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden opacity-[0.15]">
        <div className="absolute top-1/3 left-1/2 w-[200%] h-[200px] -translate-x-1/2 bg-[linear-gradient(90deg,_rgba(255,255,255,0.06)_0%,_rgba(255,255,255,0.02)_50%,_rgba(255,255,255,0.06)_100%)] animate-darkWave" />
      </div>
      <div className="pointer-events-none absolute inset-0 -z-10 opacity-[0.07]">
        <div className="absolute top-1/3 left-1/2 w-[200%] h-[160px] -translate-x-1/2 bg-[linear-gradient(90deg,rgba(255,255,255,0.25)_0%,rgba(255,255,255,0.02)_50%,rgba(255,255,255,0.25)_100%)] blur-3xl animate-softWave" />
      </div>
      <div className="pointer-events-none absolute -z-10 -right-24 top-10 h-64 w-64 rounded-full bg-[radial-gradient(circle_at_30%_0%,rgba(56,189,248,0.45),transparent_60%)] blur-3xl opacity-80" />
      <div className="pointer-events-none absolute -z-10 -left-32 bottom-0 h-80 w-80 rounded-full bg-[radial-gradient(circle_at_70%_100%,rgba(236,72,153,0.55),transparent_60%)] blur-3xl opacity-80" />

      <div className="w-full max-w-6xl space-y-8 animate-fade-in-slow">
        <header className="space-y-3 text-center md:text-left">
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
            Remotion Auto-Captioner
          </h1>
          <p className="text-sm md:text-base text-slate-300/90 max-w-3xl mx-auto md:mx-0">
            Upload an MP4, auto-generate captions using Whisper, fine-tune the
            styling, preview instantly, add image/video B-roll, and export.
          </p>
        </header>

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1.45fr)] items-start">
          <div className="space-y-4">
            {/* Upload + caption UI (unchanged markup & styles) */}
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
                <span className="absolute inset-0 bg-[linear-gradient(140deg,#fb923c,#ec4899,#6366f1)] bg-[length:150%_150%]animate-button-gradient-slow" />
                <span className="absolute inset-0 rounded-xl border border-white/15" />
                <span className="relative flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-100 shadow-[0_0_14px_rgba(251,113,133,0.9)]" />
                  Export video
                </span>
              </button>
            </div>
          </div>

          <div>
            {/* Preview card */}
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
                    <span className="h-full w-1.5 rounded-full bg-pink-400 animate-pulse" />
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
                      allImages,
                      bRolls,
                    }}
                    durationInFrames={Math.round(durationInSeconds * fps)}
                    fps={fps}
                    autoPlay
                    compositionWidth={videoWidth || 1920}
                    compositionHeight={videoHeight || 1080}
                    controls
                    style={{
                      width: "100%",
                      height: "auto",
                      // CSS aspect-ratio string using intrinsic dimensions when available
                      aspectRatio:
                        videoWidth && videoHeight
                          ? `${videoWidth} / ${videoHeight}`
                          : undefined,
                    }}
                  />
                </div>
              ) : (
                <div className="flex h-64 items-center justify-center rounded-xl overflow-hidden bg-[#0f0f11] border border-[#2d2d30] shadow-[0_10px_40px_rgba(0,0,0,0.5)] text-center text-sm text-slate-500 animate-pulse-subtle">
                  Upload a video to see the preview here.
                </div>
              )}
            </div>

            {/* Search panel */}
            <div className=" my-6 rounded-2xl border border-[#252528] bg-[rgba(20,20,22,0.9)] backdrop-blur-2xl shadow-[0_22px_70px_rgba(0,0,0,0.8)] p-5 transition-transform duration-300">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-400/12 text-[11px] text-emerald-200 border border-emerald-400/40">
                    +
                  </span>
                  Media search (Pexels)
                </h2>
              </div>

              <p className="text-xs text-slate-300/80 mb-3">
                Search free photos or videos from Pexels. Click a result to add
                as B-roll.
              </p>

              <div className="flex gap-2 mb-3 items-center">
                <select
                  value={searchType}
                  onChange={(e) => setSearchType(e.target.value as any)}
                  className="rounded px-2 py-2 bg-[#0b0b0b] text-sm"
                >
                  <option value="photos">Photos</option>
                  <option value="videos">Videos</option>
                </select>

                <input
                  type="text"
                  placeholder="Search for media (e.g. 'city', 'office', 'nature')"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSearch();
                  }}
                  className="flex-1 rounded-lg border border-[#2b2b2e] bg-[#0f1012] px-3 py-2 text-sm text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#050509]"
                />

                <button
                  onClick={() => handleSearch()}
                  disabled={isSearching || !query.trim()}
                  className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium bg-gradient-to-r from-emerald-500 to-teal-400 text-black disabled:opacity-60"
                >
                  {isSearching ? "Searching..." : "Search"}
                </button>
              </div>

              {searchError && (
                <div className="text-xs text-rose-400 mb-2">{searchError}</div>
              )}

              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {searchResults.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => openAddBRollForm(r.src, r.thumb, r.type)}
                    title="Click to add to pool / add as B-roll"
                    className="rounded-md overflow-hidden border border-[#2a2a2d] bg-[#0b0b0c] focus-visible:outline-none relative"
                  >
                    {r.type === "video" ? (
                      <>
                        {r.thumb ? (
                          <img
                            src={r.thumb}
                            alt=""
                            className="w-full h-24 object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-24 bg-black flex items-center justify-center text-xs">
                            Video
                          </div>
                        )}
                        <div className="absolute left-2 top-2 text-[10px] px-1 py-0.5 rounded bg-black/60 text-white">
                          Video
                        </div>
                      </>
                    ) : (
                      <img
                        src={r.thumb || r.src}
                        alt=""
                        className="w-full h-24 object-cover transition-transform hover:scale-105"
                        loading="lazy"
                      />
                    )}
                  </button>
                ))}
              </div>

              {allImages.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-sm font-semibold mb-2">
                    Selected images
                  </h3>
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    {allImages.map((src, i) => (
                      <div
                        key={i}
                        className="w-28 h-16 rounded-md overflow-hidden border border-[#222]"
                      >
                        {/* If a video file URL accidentally got stored, render a <video>,
                            otherwise render an <img>. This keeps old data working. */}
                        {looksLikeVideoFile(src) ? (
                          <video
                            src={src}
                            className="w-full h-full object-cover"
                            muted
                            playsInline
                          />
                        ) : (
                          <img
                            src={src}
                            alt={`selected-${i}`}
                            className="w-full h-full object-cover"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* B-roll editor */}
            <div className="my-4 rounded-2xl border border-[#252528] bg-[rgba(20,20,22,0.9)] p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold">B-roll timeline</h3>
              </div>

              {bRolls.length === 0 ? (
                <div className="text-xs text-slate-400">
                  No b-roll items added yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {bRolls.map((b) => (
                    <div
                      key={b.id}
                      className="flex items-center gap-3 p-2 rounded border bg-[#080808]"
                    >
                      <div className="w-28 h-16 overflow-hidden rounded border">
                        {b.type === "video" ? (
                          // prefer thumb (image) for video preview if available, otherwise use video src
                          (b.thumb || b.src).endsWith(".mp4") ? (
                            <video
                              src={b.src}
                              className="w-full h-full object-cover"
                              muted
                              playsInline
                            />
                          ) : (
                            <img
                              src={b.thumb || b.src}
                              className="w-full h-full object-cover"
                            />
                          )
                        ) : (
                          <img
                            src={b.thumb || b.src}
                            className="w-full h-full object-cover"
                          />
                        )}
                      </div>

                      <div className="flex-1 text-sm">
                        <div className="flex items-center gap-3">
                          <label className="text-xs flex items-center gap-1">
                            <span>Start</span>
                            <input
                              type="number"
                              min={0}
                              step={0.1}
                              value={b.startSeconds}
                              onChange={(e) =>
                                updateBRoll(b.id, {
                                  startSeconds: Number(e.target.value),
                                })
                              }
                              className="w-20 rounded px-1 py-0.5 bg-[#0b0b0b] text-xs"
                            />
                            s
                          </label>

                          <label className="text-xs flex items-center gap-1">
                            <span>Duration</span>
                            <input
                              type="number"
                              min={0.1}
                              step={0.1}
                              value={b.durationSeconds}
                              onChange={(e) =>
                                updateBRoll(b.id, {
                                  durationSeconds: Number(e.target.value),
                                })
                              }
                              className="w-20 rounded px-1 py-0.5 bg-[#0b0b0b] text-xs"
                            />
                            s
                          </label>

                          <label className="text-xs flex items-center gap-1">
                            <span>Type</span>
                            <select
                              value={b.type}
                              onChange={(e) =>
                                updateBRoll(b.id, {
                                  type: e.target.value as any,
                                })
                              }
                              className="rounded px-1 py-0.5 bg-[#0b0b0b] text-xs"
                            >
                              <option value="image">Image</option>
                              <option value="video">Video</option>
                            </select>
                          </label>
                        </div>
                        <div className="mt-1 text-xs text-slate-400 truncate">
                          {b.src}
                        </div>
                      </div>

                      <div className="flex flex-col gap-2">
                        <button
                          onClick={() => removeBRoll(b.id)}
                          className="px-3 py-1 rounded bg-rose-600 text-white text-xs"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* Add B-roll modal */}
      {selectedForBRoll && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={cancelAddBRoll}
          />
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-[#2b2b2e] bg-[#0b0b0d] p-4 shadow-xl">
            <div className="flex items-start gap-3">
              <div className="w-28 h-16 rounded overflow-hidden border">
                {selectedForBRoll.type === "video" ? (
                  <video
                    src={selectedForBRoll.thumb || selectedForBRoll.src}
                    className="w-full h-full object-cover"
                    muted
                    playsInline
                  />
                ) : (
                  <img
                    src={selectedForBRoll.thumb || selectedForBRoll.src}
                    className="w-full h-full object-cover"
                  />
                )}
              </div>

              <div className="flex-1">
                <h3 className="text-sm font-semibold">
                  Add as B-roll ({selectedForBRoll.type})
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Choose start time and duration (seconds).
                </p>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <label className="text-xs">
                    Start (s)
                    <input
                      type="number"
                      min={0}
                      step={0.1}
                      value={brStartSeconds}
                      onChange={(e) =>
                        setBrStartSeconds(Number(e.target.value))
                      }
                      className="mt-1 w-full rounded bg-[#0b0b0b] px-2 py-1 text-sm"
                    />
                  </label>

                  <label className="text-xs">
                    Duration (s)
                    <input
                      type="number"
                      min={0.1}
                      step={0.1}
                      value={brDurationSeconds}
                      onChange={(e) =>
                        setBrDurationSeconds(Number(e.target.value))
                      }
                      className="mt-1 w-full rounded bg-[#0b0b0b] px-2 py-1 text-sm"
                    />
                  </label>
                </div>
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={cancelAddBRoll}
                className="px-3 py-1 rounded bg-[#1f1f21] text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleAddBRoll}
                className="px-3 py-1 rounded bg-emerald-500 text-black text-sm"
              >
                Add as B-roll
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
