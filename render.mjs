// render.mjs
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import path from "path";
import fs from "fs";
import fsPromises from "fs/promises";
import http from "http";
import url from "url";
import os from "os";
import { spawnSync } from "child_process";
import ffmpegPath from "ffmpeg-static";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
function log(...args) {
    console.log("[render.mjs]", ...args);
}

/**
 * Start a tiny HTTP server that serves the given video file at /video
 * and serves b-roll files from brollDir under /broll/<filename>
 * - /video supports Range requests
 * - /broll/<file> supports Range for video files and simple streaming for images
 */
async function startVideoServer(videoPath, brollDir) {
    if (!fs.existsSync(videoPath)) {
        throw new Error("Video file does not exist: " + videoPath);
    }
    const stat = await fsPromises.stat(videoPath);
    const fileSize = stat.size;

    return new Promise((resolve, reject) => {
        const server = http.createServer((req, res) => {
            try {
                if (!req.url) {
                    res.statusCode = 400;
                    res.end("Bad request");
                    return;
                }
                const parsed = new URL(req.url, "http://localhost");
                const pathname = parsed.pathname;

                // Serve main video at /video (with range support)
                if (pathname === "/video") {
                    const range = req.headers.range;
                    res.setHeader("Access-Control-Allow-Origin", "*");
                    res.setHeader("Access-Control-Expose-Headers", "Content-Length,Content-Range");

                    if (!range) {
                        res.writeHead(200, {
                            "Content-Length": fileSize,
                            "Content-Type": "video/mp4",
                            "Accept-Ranges": "bytes",
                        });
                        fs.createReadStream(videoPath).pipe(res);
                        return;
                    }

                    const parts = range.replace(/bytes=/, "").split("-");
                    const start = parseInt(parts[0], 10);
                    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
                    const chunkSize = end - start + 1;

                    res.writeHead(206, {
                        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
                        "Accept-Ranges": "bytes",
                        "Content-Length": chunkSize,
                        "Content-Type": "video/mp4",
                    });

                    const stream = fs.createReadStream(videoPath, { start, end });
                    stream.on("error", (err) => res.destroy(err));
                    stream.pipe(res);
                    return;
                }

                // Serve b-roll assets under /broll/<filename>
                if (pathname.startsWith("/broll/")) {
                    const name = decodeURIComponent(pathname.replace("/broll/", ""));
                    const filePath = path.join(brollDir, name);

                    if (!fs.existsSync(filePath)) {
                        res.statusCode = 404;
                        res.end("Not found");
                        return;
                    }

                    const ext = path.extname(filePath).slice(1).toLowerCase();
                    const videoExts = new Set(["mp4", "mov", "webm", "mkv", "ogg", "ogv", "m4v"]);
                    const isVideo = videoExts.has(ext);

                    res.setHeader("Access-Control-Allow-Origin", "*");

                    if (isVideo) {
                        // Range support for video b-roll too (crucial)
                        const stat = fs.statSync(filePath);
                        const total = stat.size;
                        const range = req.headers.range;
                        res.setHeader("Accept-Ranges", "bytes");
                        if (!range) {
                            res.writeHead(200, {
                                "Content-Length": total,
                                "Content-Type": "video/mp4",
                            });
                            fs.createReadStream(filePath).pipe(res);
                            return;
                        }
                        const parts = range.replace(/bytes=/, "").split("-");
                        const start = parseInt(parts[0], 10);
                        const end = parts[1] ? parseInt(parts[1], 10) : total - 1;
                        const chunkSize = end - start + 1;
                        res.writeHead(206, {
                            "Content-Range": `bytes ${start}-${end}/${total}`,
                            "Accept-Ranges": "bytes",
                            "Content-Length": chunkSize,
                            "Content-Type": "video/mp4",
                        });
                        const stream = fs.createReadStream(filePath, { start, end });
                        stream.on("error", (err) => res.destroy(err));
                        stream.pipe(res);
                        return;
                    } else {
                        // images: serve normally with an image MIME
                        let mime = "image/jpeg";
                        if (ext === "png") mime = "image/png";
                        if (ext === "svg") mime = "image/svg+xml";
                        if (ext === "webp") mime = "image/webp";
                        res.setHeader("Content-Type", mime);
                        fs.createReadStream(filePath).pipe(res);
                        return;
                    }
                }

                res.statusCode = 404;
                res.end("Not found");
            } catch (err) {
                console.error("[render.mjs] HTTP server error:", err);
                res.statusCode = 500;
                res.end("Internal server error");
            }
        });

        server.on("error", (err) => {
            console.error("[render.mjs] Video server error:", err);
            reject(err);
        });

        server.listen(0, "127.0.0.1", () => {
            const address = server.address();
            if (typeof address === "string" || !address) {
                reject(new Error("Could not determine server address"));
                return;
            }
            const port = address.port;
            const videoUrl = `http://127.0.0.1:${port}/video`;
            log("Video server started at", videoUrl, "serving b-roll from", brollDir);
            resolve({ server, videoUrl, port });
        });
    });
}

/**
 * Trim a video using ffmpeg with stream copy (-c copy) to avoid re-encoding.
 * This preserves original framerate and avoids speed changes.
 * If stream copy fails (container incompatibility), fall back to re-encode
 * with preserved fps (by not forcing different framerate).
 *
 * inPath -> outPath
 */
function trimVideoCopyOrEncode(inPath, outPath, durationSeconds) {
    // Try fast copy trim: -ss 0 -t <duration> -c copy
    try {
        const copyArgs = ["-y", "-ss", "0", "-i", inPath, "-t", String(durationSeconds), "-c", "copy", outPath];
        log("ffmpeg copy-trim args:", ffmpegPath, copyArgs.join(" "));
        const r = spawnSync(ffmpegPath, copyArgs, { stdio: "inherit", timeout: 2 * 60 * 1000 });
        if (r.error) throw r.error;
        if (r.status === 0) {
            return true;
        }
        log("[render.mjs] ffmpeg copy-trim failed with status", r.status, "falling back to encode");
    } catch (err) {
        log("[render.mjs] ffmpeg copy-trim error:", err);
    }

    // Fallback: re-encode but preserve framerate (do not change it explicitly)
    try {
        const encodeArgs = [
            "-y",
            "-ss",
            "0",
            "-i",
            inPath,
            "-t",
            String(durationSeconds),
            "-c:v",
            "libx264",
            "-preset",
            "fast",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-b:a",
            "128k",
            outPath,
        ];
        log("ffmpeg encode args:", ffmpegPath, encodeArgs.join(" "));
        const r2 = spawnSync(ffmpegPath, encodeArgs, { stdio: "inherit", timeout: 4 * 60 * 1000 });
        if (r2.error) throw r2.error;
        if (r2.status === 0) return true;
        throw new Error("ffmpeg encode failed with status " + r2.status);
    } catch (err) {
        log("[render.mjs] ffmpeg encode fallback failed:", err);
        return false;
    }
}

/**
 * Download/copy b-roll into brollDir. For video files:
 *  - If item.durationSeconds provided: create a trimmed copy (no looping)
 *  - Otherwise just save the downloaded file and return it as-is (no re-encode)
 */
async function downloadToBrollDir(src, brollDir, filenameHint = "broll", desiredDuration = null) {
    if (!src || typeof src !== "string") return src;

    // detect extension / video
    const videoExts = new Set([".mp4", ".mov", ".mkv", ".webm", ".ogg", ".ogv", ".m4v"]);
    const getExt = (p) => {
        try {
            const u = new URL(p);
            return path.extname(u.pathname) || "";
        } catch {
            return path.extname(p) || "";
        }
    };

    // file:// local
    if (src.startsWith("file://")) {
        const localPath = src.replace("file://", "");
        if (!fs.existsSync(localPath)) throw new Error("Local b-roll not found: " + localPath);
        const ext = getExt(localPath) || ".jpg";
        const unique = `${filenameHint}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}${ext}`;
        const outPath = path.join(brollDir, unique);
        await fsPromises.copyFile(localPath, outPath);

        if (videoExts.has(ext.toLowerCase())) {
            // if desiredDuration specified -> trim (no loop), else return as-is
            if (desiredDuration && desiredDuration > 0) {
                const trimmed = path.join(brollDir, `trim-${unique}`);
                const ok = trimVideoCopyOrEncode(outPath, trimmed, desiredDuration);
                if (ok) {
                    // optional: remove original
                    await fsPromises.unlink(outPath).catch(() => { });
                    return trimmed;
                }
            }
            return outPath;
        }
        return outPath;
    }

    // local path (not http)
    if (!src.startsWith("http://") && !src.startsWith("https://")) {
        if (fs.existsSync(src)) {
            const ext = getExt(src) || ".jpg";
            const unique = `${filenameHint}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}${ext}`;
            const outPath = path.join(brollDir, unique);
            await fsPromises.copyFile(src, outPath);
            if (videoExts.has(ext.toLowerCase())) {
                if (desiredDuration && desiredDuration > 0) {
                    const trimmed = path.join(brollDir, `trim-${unique}`);
                    const ok = trimVideoCopyOrEncode(outPath, trimmed, desiredDuration);
                    if (ok) {
                        await fsPromises.unlink(outPath).catch(() => { });
                        return trimmed;
                    }
                }
                return outPath;
            }
            return outPath;
        }
        // unknown local format -> return as-is
        return src;
    }

    // remote http(s)
    log("Downloading B-roll:", src);
    const res = await fetch(src);
    if (!res.ok) throw new Error(`Failed to download ${src}: ${res.status}`);
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const ext = getExt(src) || ".jpg";
    const unique = `${filenameHint}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}${ext}`;
    const outPath = path.join(brollDir, unique);
    await fsPromises.writeFile(outPath, buffer);
    log("Saved B-roll to", outPath);

    if (videoExts.has(ext.toLowerCase())) {
        if (desiredDuration && desiredDuration > 0) {
            const trimmed = path.join(brollDir, `trim-${unique}`);
            const ok = trimVideoCopyOrEncode(outPath, trimmed, desiredDuration);
            if (ok) {
                await fsPromises.unlink(outPath).catch(() => { });
                return trimmed;
            }
        }
        return outPath;
    }

    return outPath;
}

async function main() {
    // node render.mjs <videoPath> <captionsPath> <stylePreset> <outPath> <durationSeconds?>
    const [, , videoPath, captionsPath, stylePreset, outPath, durationArg] = process.argv;
    if (!videoPath || !captionsPath || !stylePreset || !outPath) {
        throw new Error("Usage: node render.mjs <videoPath> <captionsPath> <stylePreset> <outPath> <durationSeconds?>");
    }
    const durationSecondsFromCli = durationArg ? Number(durationArg) : 0;

    if (!fs.existsSync(captionsPath)) {
        throw new Error("Captions file does not exist: " + captionsPath);
    }

    const entryPoint = path.join(__dirname, "remotion", "index.tsx");

    const captionsJson = await fsPromises.readFile(captionsPath, "utf8");
    let captionsData;
    try {
        captionsData = JSON.parse(captionsJson);
    } catch (err) {
        console.error("[render.mjs] Failed to parse captions JSON:", err);
        throw err;
    }

    let captions;
    let bRolls = [];
    if (Array.isArray(captionsData)) {
        captions = captionsData;
    } else if (captionsData && typeof captionsData === "object") {
        captions = Array.isArray(captionsData.captions) ? captionsData.captions : [];
        if (Array.isArray(captionsData.bRolls)) bRolls = captionsData.bRolls;
    } else {
        captions = [];
    }

    log("Captions count:", captions.length, "B-roll count:", bRolls.length);

    // create temporary b-roll dir
    const brollDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "brolls-"));

    // start the video server on a random free port, serving both main video and b-rolls
    const { server, videoUrl, port } = await startVideoServer(videoPath, brollDir);

    // Process b-rolls: download/copy into brollDir and expose via HTTP on /broll/<filename>
    const processedBRolls = [];
    if (Array.isArray(bRolls) && bRolls.length > 0) {
        for (let i = 0; i < bRolls.length; i++) {
            const b = bRolls[i];
            try {
                const src = b.src || b.url || "";
                // when trimming we pass desired duration (so we trim, not loop)
                const desiredDur = typeof b.durationSeconds === "number" ? b.durationSeconds : null;
                const localPath = await downloadToBrollDir(src, brollDir, `broll-${i}`, desiredDur);
                const filename = path.basename(localPath);
                const publicUrl = `http://127.0.0.1:${port}/broll/${encodeURIComponent(filename)}`;
                processedBRolls.push({
                    ...b,
                    src: publicUrl,
                    _localPath: localPath,
                });
            } catch (err) {
                console.error("[render.mjs] Failed to prepare b-roll item", b, err);
                processedBRolls.push(b); // fallback; renderer may attempt to load original src
            }
        }
    }

    const compositionId = "VideoWithCaptions";
    const inputProps = {
        videoSrc: videoUrl,
        captions,
        stylePreset,
        durationInSeconds: durationSecondsFromCli || undefined,
        bRolls: processedBRolls,
    };

    try {
        const bundleLocation = await bundle({
            entryPoint,
            webpackOverride: (config) => config,
        });

        const composition = await selectComposition({
            serveUrl: bundleLocation,
            id: compositionId,
            inputProps,
        });

        const totalFrames = composition.durationInFrames;
        log("Composition found:", composition.id, "durationInFrames:", totalFrames);

        await renderMedia({
            composition,
            serveUrl: bundleLocation,
            codec: "h264",
            outputLocation: outPath,
            inputProps,
            concurrency: 1,
            timeoutInMilliseconds: 2 * 60 * 1000,
            logLevel: "info",
        });

        try {
            const stat = await fsPromises.stat(outPath);
            log("Render finished, output size:", stat.size);
        } catch (err) {
            console.error("[render.mjs] Could not stat output file:", err);
            throw err;
        }
    } finally {
        try {
            server.close();
        } catch (e) {
            /* ignore */
        }
        // optionally cleanup brollDir here
        // await fsPromises.rm(brollDir, { recursive: true, force: true });
    }
}

main().catch((err) => {
    console.error("[render.mjs] Fatal render error:", err);
    if (err && err.stack) console.error("[render.mjs] Stack:", err.stack);
    process.exit(1);
});
