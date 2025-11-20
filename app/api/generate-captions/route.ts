import { NextRequest, NextResponse } from "next/server";
import OpenAI, { toFile } from "openai";

export const runtime = "nodejs";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

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

    const openaiFile = await toFile(buffer, file.name || "audio.mp4", {
      type: file.type || "video/mp4",
    });

    const transcription = await openai.audio.transcriptions.create({
      file: openaiFile,
      model: "whisper-1",
      response_format: "verbose_json",
    });

    const segments = (transcription as any).segments || [];
    // console.log("segments", segments);
    const captions = segments.map((seg: any) => ({
      start: seg.start,
      end: seg.end,
      text: (seg.text || "").trim(),
    }));

    return NextResponse.json({ success: true, captions });
  } catch (err: any) {
    console.error("generate-captions error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Error generating captions" },
      { status: 500 }
    );
  }
}
