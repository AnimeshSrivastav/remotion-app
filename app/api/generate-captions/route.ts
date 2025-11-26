import { NextRequest, NextResponse } from "next/server";
import OpenAI, { toFile } from "openai";
import ffmpeg from "fluent-ffmpeg";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

// optional, but safe to keep:
ffmpeg.setFfmpegPath("C:\\ffmpeg\\bin\\ffmpeg.exe");

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: "No file provided" },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "video-"));
    const inputPath = path.join(tmpDir, file.name || "input.mp4");
    const audioPath = path.join(tmpDir, "audio.mp3");

    await fs.writeFile(inputPath, buffer);

    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .noVideo()
        .audioCodec("libmp3lame")
        .format("mp3")
        .on("end", () => resolve())
        .on("error", (err: any) => reject(err))
        .save(audioPath);
    });

    const audioBuffer = await fs.readFile(audioPath);

    const openaiFile = await toFile(audioBuffer, "audio.mp3", {
      type: "audio/mpeg",
    });

    const transcription = await openai.audio.transcriptions.create({
      file: openaiFile,
      model: "whisper-1",
      response_format: "verbose_json",
    });

    const segments = (transcription as any).segments || [];
    const captions = segments.map((seg: any) => ({
      start: seg.start,
      end: seg.end,
      text: (seg.text || "").trim(),
    }));

    fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});

    return NextResponse.json({ success: true, captions });
  } catch (err: any) {
    console.error("generate-captions error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Error generating captions" },
      { status: 500 }
    );
  }
}
