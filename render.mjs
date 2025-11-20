// render.mjs
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import path from "path";
import fs from "fs";
import fsPromises from "fs/promises";
import http from "http";
import url from "url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

async function startVideoServer(videoPath) {
    const stat = await fsPromises.stat(videoPath);
    const fileSize = stat.size;

    return new Promise((resolve, reject) => {
        const server = http.createServer((req, res) => {
            if (!req.url) {
                res.statusCode = 400;
                res.end("Bad request");
                return;
            }

            // Only handle /video
            const { pathname } = new URL(req.url, "http://localhost");
            if (pathname !== "/video") {
                res.statusCode = 404;
                res.end("Not found");
                return;
            }

            const range = req.headers.range;

            // Basic CORS
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.setHeader("Access-Control-Expose-Headers", "Content-Length,Content-Range");

            if (!range) {
                // No range header → serve entire file
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
                console.error("Video stream error:", err);
                res.destroy(err);
            });
            stream.pipe(res);
        });

        server.on("error", (err) => {
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
            console.log("🎥 Video server started at", videoUrl);
            resolve({ server, videoUrl });
        });
    });
}

async function main() {
    const [, , videoPath, captionsPath, stylePreset, outPath, durationArg] = process.argv;

    if (!videoPath || !captionsPath || !stylePreset || !outPath) {
        console.error(
            "Usage: node render.mjs <videoPath> <captionsPath> <stylePreset> <outPath>"
        );
        process.exit(1);
    }

    // Read captions JSON
    const captionsJson = await fsPromises.readFile(captionsPath, "utf8");
    const captions = JSON.parse(captionsJson);
    const durationSecondsFromCli = durationArg ? Number(durationArg) : 0;

    // Start local HTTP server for the video
    const { server, videoUrl } = await startVideoServer(videoPath);

    const entryPoint = path.join(__dirname, "remotion", "index.tsx");
    const compositionId = "VideoWithCaptions";

    const inputProps = {
        videoSrc: videoUrl, // 👈 IMPORTANT: HTTP URL, not file path
        captions,
        stylePreset,
        durationInSeconds: durationSecondsFromCli,
    };

    try {
        // 1) Bundle Remotion project
        const bundleLocation = await bundle({
            entryPoint,
            webpackOverride: (config) => config,
        });

        // 2) Select composition
        const composition = await selectComposition({
            serveUrl: bundleLocation,
            id: compositionId,
            inputProps,
        });


        // Compute duration based on last caption (fallback to 60s)
        const captionsLastEnd = captions.length
            ? Math.max(...captions.map((c) => c.end || 0))
            : 0;

        const durationSecondsFromCli = durationArg ? Number(durationArg) : 0;

        // 3) Render video
        await renderMedia({
            composition,
            serveUrl: bundleLocation,
            codec: "h264",
            outputLocation: outPath,
            inputProps,

            // You can tweak concurrency or other options here if needed
        });

        console.log("✅ Render done:", outPath);
    } finally {
        // Always close the video server
        server.close();
    }
}

main().catch((err) => {
    console.error("Render error:", err);
    process.exit(1);
});
