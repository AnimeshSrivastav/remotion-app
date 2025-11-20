import { spawn } from "child_process";
import fsPromises from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import os from "os";
import path from "path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function runRenderScript(
  videoPath: string,
  captionsPath: string,
  stylePreset: string,
  outPath: string,
  durationInSeconds: number
): Promise<void> {
  const scriptPath = path.join(process.cwd(), "render.mjs");
  console.log("Using render script:", scriptPath);

  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        scriptPath,
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

    let stderr = "";
    let stdout = "";

    child.stdout.on("data", (data) => {
      const text = data.toString();
      stdout += text;
      console.log("[render.mjs stdout]", text.trim());
    });

    child.stderr.on("data", (data) => {
      const text = data.toString();
      stderr += text;
      console.error("[render.mjs stderr]", text.trim());
    });

    child.on("close", (code) => {
      if (code === 0) {
        console.log("[runRenderScript] render.mjs exited cleanly");
        resolve();
      } else {
        console.error(
          "[runRenderScript] render.mjs exited with code",
          code,
          "stderr:",
          stderr || "<empty>"
        );
        reject(
          new Error(
            `render.mjs exited with code ${code}. stderr: ${
              stderr || "<empty>"
            }`
          )
        );
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
    const durationStr = formData.get("durationInSeconds") as string | null;
    const durationInSeconds = durationStr ? Number(durationStr) : 0;

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

    const tmpDir = os.tmpdir();
    const id = Date.now().toString();

    const videoPath = path.join(tmpDir, `video-${id}.mp4`);
    const captionsPath = path.join(tmpDir, `captions-${id}.json`);
    const outPath = path.join(tmpDir, `captioned-${id}.mp4`);

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    await fsPromises.writeFile(videoPath, buffer);

    await fsPromises.writeFile(captionsPath, JSON.stringify(captions));

    await runRenderScript(
      videoPath,
      captionsPath,
      stylePreset,
      outPath,
      durationInSeconds
    );

    const videoBuffer = await fsPromises.readFile(outPath);

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
