// render.mjs
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import path from "path";
import fs from "fs";
import fsPromises from "fs/promises";
import http from "http";
import url from "url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

function log(...args) {
    console.log("[render.mjs]", ...args);
}

/**
 * Start a tiny HTTP server that serves the given video file.
 */
async function startVideoServer(videoPath) {
    log("Starting video server for:", videoPath);

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

                const { pathname } = new URL(req.url, "http://localhost");
                if (pathname !== "/video") {
                    res.statusCode = 404;
                    res.end("Not found");
                    return;
                }

                const range = req.headers.range;

                res.setHeader("Access-Control-Allow-Origin", "*");
                res.setHeader(
                    "Access-Control-Expose-Headers",
                    "Content-Length,Content-Range"
                );

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
                stream.on("error", (err) => {
                    console.error("[render.mjs] Video stream error:", err);
                    res.destroy(err);
                });
                stream.pipe(res);
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
            log("Video server started at", videoUrl);
            resolve({ server, videoUrl });
        });
    });
}

async function main() {
    log("Process argv:", process.argv);

    // node render.mjs <videoPath> <captionsPath> <stylePreset> <outPath> <durationSeconds?>
    const [, , videoPath, captionsPath, stylePreset, outPath, durationArg] =
        process.argv;

    if (!videoPath || !captionsPath || !stylePreset || !outPath) {
        throw new Error(
            "Usage: node render.mjs <videoPath> <captionsPath> <stylePreset> <outPath> <durationSeconds?>"
        );
    }

    const durationSecondsFromCli = durationArg ? Number(durationArg) : 0;
    log("Args parsed:", {
        videoPath,
        captionsPath,
        stylePreset,
        outPath,
        durationSecondsFromCli,
    });

    if (!fs.existsSync(captionsPath)) {
        throw new Error("Captions file does not exist: " + captionsPath);
    }

    const entryPoint = path.join(__dirname, "remotion", "index.tsx");
    log("Entry point:", entryPoint, "exists?", fs.existsSync(entryPoint));

    const captionsJson = await fsPromises.readFile(captionsPath, "utf8");
    let captions;
    try {
        captions = JSON.parse(captionsJson);
    } catch (err) {
        console.error("[render.mjs] Failed to parse captions JSON:", err);
        throw err;
    }

    const { server, videoUrl } = await startVideoServer(videoPath);

    const compositionId = "VideoWithCaptions";

    const inputProps = {
        videoSrc: videoUrl,
        captions,
        stylePreset,
        durationInSeconds: durationSecondsFromCli || undefined,
    };

    try {
        log("Bundling Remotion project...");
        const bundleLocation = await bundle({
            entryPoint,
            webpackOverride: (config) => config,
        });
        log("Bundle created at:", bundleLocation);

        log("Selecting composition:", compositionId);
        const composition = await selectComposition({
            serveUrl: bundleLocation,
            id: compositionId,
            inputProps,
        });

        log("Composition loaded:", {
            id: composition.id,
            width: composition.width,
            height: composition.height,
            fps: composition.fps,
            durationInFrames: composition.durationInFrames,
        });

        log("Starting renderMedia...");

        const totalFrames = composition.durationInFrames;

        await renderMedia({
            composition,
            serveUrl: bundleLocation,
            codec: "h264",
            outputLocation: outPath,
            inputProps,
            // 👇 IMPORTANT: keep load reasonable on tiny Render machine
            concurrency: 1,
            // time limit so we don't hang forever (e.g. 2 minutes)
            timeoutInMilliseconds: 2 * 60 * 1000,
            logLevel: "info",
            onProgress: (progress) => {
                log(
                    `Progress: ${progress.renderedFrames}/${totalFrames} frames ` +
                    `(chunk ${progress.chunk} of ${progress.totalChunks})`
                );
            },
        });

        log("✅ Render done:", outPath);
    } finally {
        log("Stopping video server...");
        server.close();
    }
}

main().catch((err) => {
    console.error("[render.mjs] ❌ Fatal render error:", err);
    if (err && err.stack) {
        console.error("[render.mjs] Stack:", err.stack);
    }
    process.exit(1);
});
// render.mjs
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import path from "path";
import fs from "fs";
import fsPromises from "fs/promises";
import http from "http";
import url from "url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

function log(...args) {
    console.log("[render.mjs]", ...args);
}

/**
 * Start a tiny HTTP server that serves the given video file.
 */
async function startVideoServer(videoPath) {
    log("Starting video server for:", videoPath);

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

                const { pathname } = new URL(req.url, "http://localhost");
                if (pathname !== "/video") {
                    res.statusCode = 404;
                    res.end("Not found");
                    return;
                }

                const range = req.headers.range;

                res.setHeader("Access-Control-Allow-Origin", "*");
                res.setHeader(
                    "Access-Control-Expose-Headers",
                    "Content-Length,Content-Range"
                );

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
                stream.on("error", (err) => {
                    console.error("[render.mjs] Video stream error:", err);
                    res.destroy(err);
                });
                stream.pipe(res);
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
            log("Video server started at", videoUrl);
            resolve({ server, videoUrl });
        });
    });
}

async function main() {
    log("Process argv:", process.argv);

    // node render.mjs <videoPath> <captionsPath> <stylePreset> <outPath> <durationSeconds?>
    const [, , videoPath, captionsPath, stylePreset, outPath, durationArg] =
        process.argv;

    if (!videoPath || !captionsPath || !stylePreset || !outPath) {
        throw new Error(
            "Usage: node render.mjs <videoPath> <captionsPath> <stylePreset> <outPath> <durationSeconds?>"
        );
    }

    const durationSecondsFromCli = durationArg ? Number(durationArg) : 0;
    log("Args parsed:", {
        videoPath,
        captionsPath,
        stylePreset,
        outPath,
        durationSecondsFromCli,
    });

    if (!fs.existsSync(captionsPath)) {
        throw new Error("Captions file does not exist: " + captionsPath);
    }

    const entryPoint = path.join(__dirname, "remotion", "index.tsx");
    log("Entry point:", entryPoint, "exists?", fs.existsSync(entryPoint));

    const captionsJson = await fsPromises.readFile(captionsPath, "utf8");
    let captions;
    try {
        captions = JSON.parse(captionsJson);
    } catch (err) {
        console.error("[render.mjs] Failed to parse captions JSON:", err);
        throw err;
    }

    const { server, videoUrl } = await startVideoServer(videoPath);

    const compositionId = "VideoWithCaptions";

    const inputProps = {
        videoSrc: videoUrl,
        captions,
        stylePreset,
        durationInSeconds: durationSecondsFromCli || undefined,
    };

    try {
        log("Bundling Remotion project...");
        const bundleLocation = await bundle({
            entryPoint,
            webpackOverride: (config) => config,
        });
        log("Bundle created at:", bundleLocation);

        log("Selecting composition:", compositionId);
        const composition = await selectComposition({
            serveUrl: bundleLocation,
            id: compositionId,
            inputProps,
        });

        log("Composition loaded:", {
            id: composition.id,
            width: composition.width,
            height: composition.height,
            fps: composition.fps,
            durationInFrames: composition.durationInFrames,
        });

        log("Starting renderMedia...");

        const totalFrames = composition.durationInFrames;

        await renderMedia({
            composition,
            serveUrl: bundleLocation,
            codec: "h264",
            outputLocation: outPath,
            inputProps,
            // 👇 IMPORTANT: keep load reasonable on tiny Render machine
            concurrency: 1,
            // time limit so we don't hang forever (e.g. 2 minutes)
            timeoutInMilliseconds: 2 * 60 * 1000,
            logLevel: "info",
            onProgress: (progress) => {
                log(
                    `Progress: ${progress.renderedFrames}/${totalFrames} frames ` +
                    `(chunk ${progress.chunk} of ${progress.totalChunks})`
                );
            },
        });

        log("✅ Render done:", outPath);
    } finally {
        log("Stopping video server...");
        server.close();
    }
}

main().catch((err) => {
    console.error("[render.mjs] ❌ Fatal render error:", err);
    if (err && err.stack) {
        console.error("[render.mjs] Stack:", err.stack);
    }
    process.exit(1);
});
