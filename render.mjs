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

                    res.destroy(err);
                });
                stream.pipe(res);
            } catch (err) {
                console.error("HTTP server error:", err);
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


    // node render.mjs <videoPath> <captionsPath> <stylePreset> <outPath> <durationSeconds?>
    const [, , videoPath, captionsPath, stylePreset, outPath, durationArg] =
        process.argv;

    if (!videoPath || !captionsPath || !stylePreset || !outPath) {
        throw new Error(
            "Usage: node render.mjs <videoPath> <captionsPath> <stylePreset> <outPath> <durationSeconds?>"
        );
    }

    const durationSecondsFromCli = durationArg ? Number(durationArg) : 0;


    if (!fs.existsSync(captionsPath)) {
        throw new Error("Captions file does not exist: " + captionsPath);
    }

    const entryPoint = path.join(__dirname, "remotion", "index.tsx");


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

        } catch (err) {
            console.error("[render.mjs] Could not stat output file:", err);
            throw err;
        }

    } finally {
        server.close();
    }
}

main().catch((err) => {
    console.error("[render.mjs] Fatal render error:", err);
    if (err && err.stack) {
        console.error("[render.mjs] Stack:", err.stack);
    }
    process.exit(1);
});
