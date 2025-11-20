// app/api/render/route.ts
import { spawn } from "child_process";
import fsPromises from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import os from "os";
import path from "path";

export const runtime = "nodejs";

function runRenderScript(
  videoPath: string,
  captionsPath: string,
  stylePreset: string,
  outPath: string,
  durationInSeconds: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "node",
      [
        "render.mjs",
        videoPath,
        captionsPath,
        stylePreset,
        outPath,
        String(durationInSeconds || 0),
      ],
      {
        stdio: ["ignore", "pipe", "pipe"],
      }
    );

    child.stdout.on("data", (data) => {
      console.log("[render.mjs stdout]", data.toString());
    });

    child.stderr.on("data", (data) => {
      console.error("[render.mjs stderr]", data.toString());
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`render.mjs exited with code ${code}`));
      }
    });
  });
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const captionsStr = formData.get("captions") as string | null;
    const stylePreset =
      (formData.get("stylePreset") as string | null) ?? "bottom";
    const durationStr = formData.get("durationInSeconds") as string | null; // 👈 NEW
    const durationInSeconds = durationStr ? Number(durationStr) : null;
    if (!file) {
      return NextResponse.json(
        { success: false, error: "No file provided" },
        { status: 400 }
      );
    }
    if (!captionsStr) {
      return NextResponse.json(
        { success: false, error: "No captions provided" },
        { status: 400 }
      );
    }

    const captions = JSON.parse(captionsStr);

    // temp paths
    const tmpDir = os.tmpdir();
    const id = Date.now().toString();

    const videoPath = path.join(tmpDir, `video-${id}.mp4`);
    const captionsPath = path.join(tmpDir, `captions-${id}.json`);
    const outPath = path.join(tmpDir, `captioned-${id}.mp4`);

    // write video file
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    await fsPromises.writeFile(videoPath, buffer);

    // write captions json
    await fsPromises.writeFile(captionsPath, JSON.stringify(captions));

    // call render.mjs
    await runRenderScript(
      videoPath,
      captionsPath,
      stylePreset,
      outPath,
      durationInSeconds ?? 0
    );

    // read output mp4
    const videoBuffer = await fsPromises.readFile(outPath);

    // cleanup (best-effort)
    fsPromises.unlink(videoPath).catch(() => {});
    fsPromises.unlink(captionsPath).catch(() => {});
    fsPromises.unlink(outPath).catch(() => {});

    return new NextResponse(videoBuffer, {
      status: 200,
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": 'attachment; filename="captioned.mp4"',
      },
    });
  } catch (err: any) {
    console.error("render API error:", err);
    return NextResponse.json(
      {
        success: false,
        error: err?.message || "Error rendering video",
      },
      { status: 500 }
    );
  }
}
