import { useState } from "react";
import { createFFmpeg, fetchFile } from "@ffmpeg/ffmpeg";

export const useVideoToAudio = () => {
  const [loading, setLoading] = useState(false);
  const ffmpeg = createFFmpeg({ log: true });

  const convertVideoToAudio = async (videoFile: File): Promise<File> => {
    setLoading(true);

    if (!ffmpeg.isLoaded()) {
      await ffmpeg.load();
    }

    // Write video file to ffmpeg FS
    ffmpeg.FS("writeFile", "input.mp4", await fetchFile(videoFile));

    // Run ffmpeg to extract audio
    await ffmpeg.run("-i", "input.mp4", "-q:a", "0", "-map", "a", "output.mp3");

    // Read audio data
    const data = ffmpeg.FS("readFile", "output.mp3");

    // Convert Uint8Array to File
    const audioFile = new File([data.buffer], "audio.mp3", {
      type: "audio/mpeg",
    });

    setLoading(false);
    return audioFile;
  };

  return { convertVideoToAudio, loading };
};
