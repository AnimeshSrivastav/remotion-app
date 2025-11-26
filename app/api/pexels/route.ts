// app/api/pexels/route.ts
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const query = url.searchParams.get("query") || "";
    const per_page = url.searchParams.get("per_page") || "12";
    const page = url.searchParams.get("page") || "1";
    const type = (url.searchParams.get("type") || "photos").toLowerCase();

    if (!query || query.trim().length === 0) {
      return NextResponse.json({ error: "query required" }, { status: 400 });
    }

    const PEXELS_API_KEY = process.env.PEXELS_API_KEY;
    if (!PEXELS_API_KEY) {
      return NextResponse.json(
        { error: "Pexels API key not configured on server" },
        { status: 500 }
      );
    }

    console.log("type", query);

    let pexelsUrl = "";
    if (type === "videos") {
      pexelsUrl = `https://api.pexels.com/videos/search?query=${encodeURIComponent(
        query
      )}&per_page=${per_page}&page=${page}&orientation=${"portrait"}`;
    } else {
      pexelsUrl = `https://api.pexels.com/v1/search?query=${encodeURIComponent(
        query
      )}&per_page=${per_page}&page=${page}}&orientation=${"portrait"}`;
    }

    console.log("URL", pexelsUrl);
    const res = await fetch(pexelsUrl, {
      headers: {
        Authorization: PEXELS_API_KEY,
      },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return NextResponse.json(
        { error: `Pexels responded with ${res.status}`, details: text },
        { status: 502 }
      );
    }

    const json = await res.json();

    if (type === "videos") {
      const videos = (json?.videos || []).map((v: any) => ({
        id: v.id,
        type: "video",
        thumb: v.image || (v?.video_files?.[0]?.link ?? ""),
        src:
          (v.video_files || []).find(
            (f: any) => f.quality === "hd" && f.file_type === "video/mp4"
          )?.link ||
          (v.video_files || [])[0]?.link ||
          "",

        meta: v,
      }));
      return NextResponse.json({ results: videos });
    } else {
      const photos = (json?.photos || []).map((p: any) => ({
        id: p.id,
        type: "image",
        thumb: p.src?.medium || p.src?.small || p.src?.original || "",
        src: p.src?.original || p.src?.large || p.src?.medium || "",
        meta: p,
      }));
      return NextResponse.json({ results: photos });
    }
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
