"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import JSZip from "jszip";
import Image from "next/image";

const SEEK_VALUES = [-10, -5, -2, -1, 1, 2, 5, 10];
type MediaType = "mp4" | "webm" | "webp";
type ZipItemType = MediaType | "html";

type ZipMediaItem = {
  id: string;
  name: string;
  type: ZipItemType;
  url: string;
  htmlContent?: string;
};

const ITEM_PALETTE = [
  { border: "#334155", background: "#0f172a", accent: "#38bdf8" },
  { border: "#3f3f46", background: "#18181b", accent: "#f59e0b" },
  { border: "#3f3f46", background: "#1c1917", accent: "#f472b6" },
  { border: "#374151", background: "#111827", accent: "#34d399" },
  { border: "#44403c", background: "#1c1917", accent: "#a78bfa" },
];

function getMimeType(type: MediaType): string {
  if (type === "mp4") {
    return "video/mp4";
  }
  if (type === "webm") {
    return "video/webm";
  }
  return "image/webp";
}

function getMediaErrorMessage(error: MediaError | null): string {
  if (!error) {
    return "Unable to load video.";
  }

  if (error.code === MediaError.MEDIA_ERR_ABORTED) {
    return "Video loading was aborted.";
  }
  if (error.code === MediaError.MEDIA_ERR_NETWORK) {
    return "Network error while loading video.";
  }
  if (error.code === MediaError.MEDIA_ERR_DECODE) {
    return "Video decode failed (codec may not be supported by this browser).";
  }
  if (error.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
    return "Video source is not supported.";
  }

  return "Unable to load video.";
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) {
    return "00:00";
  }

  const whole = Math.max(0, Math.floor(seconds));
  const hrs = Math.floor(whole / 3600);
  const mins = Math.floor((whole % 3600) / 60);
  const secs = whole % 60;

  if (hrs > 0) {
    return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function parseItemMeta(fileName: string): { testId: string; device: string } {
  const idMatch = fileName.match(/(TC[-_\s]?\d+|TEST[-_\s]?\d+|[A-Z]{2,}-\d+|\b\d{4,}\b)/i);
  const deviceMatch = fileName.match(/\((mobile|desktop)\)/i);

  return {
    testId: idMatch ? idMatch[1].replace(/\s+/g, "") : "N/A",
    device: deviceMatch ? deviceMatch[1].toUpperCase() : "UNKNOWN",
  };
}

function getDisplayFileName(fileName: string, testId: string): string {
  if (testId === "N/A") {
    return fileName;
  }

  const escaped = testId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const withIdRemoved = fileName.replace(new RegExp(escaped, "i"), "");
  return withIdRemoved.replace(/^[\s._-]+/, "").trim() || fileName;
}

function VideoReviewPage() {
  const searchParams = useSearchParams();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const sliderRef = useRef<HTMLDivElement | null>(null);
  const generatedUrlsRef = useRef<string[]>([]);

  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [captureMessage, setCaptureMessage] = useState<string | null>(null);
  const [zipError, setZipError] = useState<string | null>(null);
  const [isZipLoading, setIsZipLoading] = useState(false);
  const [zipFileName, setZipFileName] = useState<string | null>(null);
  const [zipItems, setZipItems] = useState<ZipMediaItem[]>([]);
  const [selectedZipId, setSelectedZipId] = useState<string | null>(null);
  const [layoutMode, setLayoutMode] = useState<"split" | "stacked">("split");
  const [isFullscreen, setIsFullscreen] = useState(false);

  const videoUrl = searchParams.get("video")?.trim() ?? "";
  const selectedZipItem = zipItems.find((item) => item.id === selectedZipId) ?? null;
  const currentMediaUrl = selectedZipItem?.url ?? videoUrl;
  const currentMediaType: ZipItemType | null = selectedZipItem?.type
    ?? (videoUrl.toLowerCase().endsWith(".webp")
      ? "webp"
      : videoUrl.toLowerCase().endsWith(".html") || videoUrl.toLowerCase().endsWith(".htm")
        ? "html"
      : videoUrl.toLowerCase().endsWith(".webm")
        ? "webm"
        : videoUrl
          ? "mp4"
          : null);
  const isHtmlMode = currentMediaType === "html";
  const isVideoMode = currentMediaType === "mp4" || currentMediaType === "webm";
  const currentVideoMimeType = isVideoMode && currentMediaType ? getMimeType(currentMediaType) : undefined;

  const progressPercent = useMemo(() => {
    if (!isVideoMode || duration <= 0) {
      return 0;
    }
    return Math.min(100, Math.max(0, (currentTime / duration) * 100));
  }, [currentTime, duration, isVideoMode]);

  const resetPlayerState = useCallback(() => {
    setIsReady(false);
    setDuration(0);
    setCurrentTime(0);
    setIsPlaying(false);
    setCaptureMessage(null);
    setIsDragging(false);
  }, []);

  const revokeGeneratedUrls = useCallback(() => {
    generatedUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    generatedUrlsRef.current = [];
  }, []);

  const updateTimeFromPointer = useCallback((pointerClientX: number) => {
    const sliderElement = sliderRef.current;
    const videoElement = videoRef.current;

    if (!sliderElement || !videoElement || duration <= 0) {
      return;
    }

    const rect = sliderElement.getBoundingClientRect();
    const ratio = (pointerClientX - rect.left) / rect.width;
    const nextTime = Math.min(duration, Math.max(0, ratio * duration));
    videoElement.currentTime = nextTime;
    setCurrentTime(nextTime);
  }, [duration]);

  const seek = useCallback((delta: number) => {
    const videoElement = videoRef.current;
    if (!videoElement) {
      return;
    }

    const nextTime = Math.min(
      Number.isFinite(videoElement.duration) ? videoElement.duration : Number.MAX_SAFE_INTEGER,
      Math.max(0, videoElement.currentTime + delta),
    );
    videoElement.currentTime = nextTime;
    setCurrentTime(nextTime);
  }, []);

  const togglePlayPause = useCallback(async () => {
    if (!isVideoMode) {
      return;
    }

    const videoElement = videoRef.current;
    if (!videoElement) {
      return;
    }

    if (videoElement.paused) {
      try {
        await videoElement.play();
      } catch {
        setCaptureMessage("Unable to play video. Check the URL or browser autoplay policy.");
      }
      return;
    }

    videoElement.pause();
  }, [isVideoMode]);

  const captureScreenshot = useCallback(() => {
    try {
      if (!currentMediaUrl) {
        setCaptureMessage("No media available to capture.");
        return;
      }

      if (currentMediaType === "webp") {
        const anchor = document.createElement("a");
        anchor.href = currentMediaUrl;
        anchor.download = `snapshot-${Date.now()}.webp`;
        anchor.click();
        setCaptureMessage("WEBP snapshot downloaded.");
        return;
      }

      const videoElement = videoRef.current;
      if (!videoElement || !videoElement.videoWidth || !videoElement.videoHeight) {
        setCaptureMessage("Video is not ready for capture.");
        return;
      }

      const canvas = document.createElement("canvas");
      canvas.width = videoElement.videoWidth;
      canvas.height = videoElement.videoHeight;
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        setCaptureMessage("Failed to create canvas context.");
        return;
      }

      ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
      const url = canvas.toDataURL("image/png");
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `screenshot-${Date.now()}.png`;
      anchor.click();
      setCaptureMessage("PNG screenshot downloaded.");
    } catch {
      setCaptureMessage("Capture failed. Check source CORS settings.");
    }
  }, [currentMediaType, currentMediaUrl]);

  const loadZipFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".zip")) {
      setZipError("Only .zip files are supported.");
      return;
    }

    setIsZipLoading(true);
    setZipError(null);
    resetPlayerState();
    setCaptureMessage(null);

    try {
      revokeGeneratedUrls();

      const zip = await JSZip.loadAsync(file);
      const items: ZipMediaItem[] = [];
      const entries = Object.values(zip.files).filter((entry) => !entry.dir);

      for (const entry of entries) {
        const lowerName = entry.name.toLowerCase();
        const type: ZipItemType | null = lowerName.endsWith(".mp4")
          ? "mp4"
          : lowerName.endsWith(".webm")
            ? "webm"
          : lowerName.endsWith(".webp")
            ? "webp"
            : lowerName.endsWith(".html") || lowerName.endsWith(".htm")
              ? "html"
            : null;

        if (!type) {
          continue;
        }

        if (type === "html") {
          const htmlContent = await entry.async("string");
          items.push({
            id: `${entry.name}-${items.length}`,
            name: entry.name,
            type,
            url: "",
            htmlContent,
          });
        } else {
          const blob = await entry.async("blob");
          const typedBlob = new Blob([blob], { type: getMimeType(type) });
          const objectUrl = URL.createObjectURL(typedBlob);
          generatedUrlsRef.current.push(objectUrl);

          items.push({
            id: `${entry.name}-${items.length}`,
            name: entry.name,
            type,
            url: objectUrl,
          });
        }
      }

      if (items.length === 0) {
        setZipItems([]);
        setSelectedZipId(null);
        setZipFileName(file.name);
        setZipError("No .mp4/.webm/.webp/.html files found in ZIP.");
        return;
      }

      const sortedItems = [...items].sort((a, b) => {
        if (a.type === "html" && b.type !== "html") {
          return -1;
        }
        if (a.type !== "html" && b.type === "html") {
          return 1;
        }
        return a.name.localeCompare(b.name);
      });

      const firstHtml = sortedItems.find((item) => item.type === "html");
      setZipItems(sortedItems);
      setSelectedZipId(firstHtml ? firstHtml.id : sortedItems[0].id);
      setZipFileName(file.name);
      setZipError(null);
    } catch {
      setZipError("ZIP extraction failed. Please verify the ZIP file.");
    } finally {
      setIsZipLoading(false);
    }
  }, [resetPlayerState, revokeGeneratedUrls]);

  const toggleFullscreen = useCallback(async () => {
    const target = isVideoMode
      ? videoRef.current
      : currentMediaType === "webp"
        ? imageRef.current
        : currentMediaType === "html"
          ? iframeRef.current
          : null;

    if (!target) {
      return;
    }

    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }

    await target.requestFullscreen();
  }, [currentMediaType, isVideoMode]);

  useEffect(() => {
    if (!isVideoMode) {
      return;
    }

    const videoElement = videoRef.current;
    if (!videoElement) {
      return;
    }

    const handleLoadStart = () => {
      setIsReady(false);
      setDuration(0);
      setCurrentTime(0);
      setIsPlaying(false);
      setCaptureMessage(null);
    };

    const handleLoadedMetadata = () => {
      setDuration(Number.isFinite(videoElement.duration) ? videoElement.duration : 0);
      setIsReady(true);
      setCurrentTime(videoElement.currentTime || 0);
      setCaptureMessage(null);
      void videoElement.play().catch(() => {
        setCaptureMessage("Autoplay was blocked by the browser. Press Play to start.");
      });
    };

    const handleTimeUpdate = () => {
      if (!isDragging) {
        setCurrentTime(videoElement.currentTime || 0);
      }
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => setIsPlaying(false);
    const handleError = () => setCaptureMessage(getMediaErrorMessage(videoElement.error));

    videoElement.addEventListener("loadstart", handleLoadStart);
    videoElement.addEventListener("loadedmetadata", handleLoadedMetadata);
    videoElement.addEventListener("timeupdate", handleTimeUpdate);
    videoElement.addEventListener("play", handlePlay);
    videoElement.addEventListener("pause", handlePause);
    videoElement.addEventListener("ended", handleEnded);
    videoElement.addEventListener("error", handleError);

    return () => {
      videoElement.removeEventListener("loadstart", handleLoadStart);
      videoElement.removeEventListener("loadedmetadata", handleLoadedMetadata);
      videoElement.removeEventListener("timeupdate", handleTimeUpdate);
      videoElement.removeEventListener("play", handlePlay);
      videoElement.removeEventListener("pause", handlePause);
      videoElement.removeEventListener("ended", handleEnded);
      videoElement.removeEventListener("error", handleError);
    };
  }, [isDragging, isVideoMode, currentMediaUrl]);

  useEffect(() => {
    if (!isVideoMode) {
      return;
    }

    const videoElement = videoRef.current;
    if (!videoElement) {
      return;
    }

    videoElement.load();
  }, [currentMediaUrl, currentMediaType, isVideoMode]);

  useEffect(() => {
    return () => {
      revokeGeneratedUrls();
    };
  }, [revokeGeneratedUrls]);

  useEffect(() => {
    const onFullscreenChange = () => {
      const mediaFullscreen =
        document.fullscreenElement === videoRef.current
        || document.fullscreenElement === imageRef.current
        || document.fullscreenElement === iframeRef.current;
      setIsFullscreen(mediaFullscreen);
    };

    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, []);

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex w-full flex-col gap-8 px-8 py-8">
        <h1 className="text-2xl font-semibold">Video Review Tool</h1>

        <div className={`grid gap-8 ${layoutMode === "split" ? "md:grid-cols-[420px_1fr]" : "grid-cols-1"}`}>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm text-zinc-300">
              Review using querystring:
              {" "}
              <code className="rounded bg-zinc-800 px-2 py-1">?video=https://example.com/video.mp4</code>
            </p>
            <button
              type="button"
              onClick={() => setLayoutMode((prev) => (prev === "split" ? "stacked" : "split"))}
              aria-label={layoutMode === "split" ? "Switch to top and bottom layout" : "Switch to left and right layout"}
              title={layoutMode === "split" ? "Top / Bottom" : "Left / Right"}
              className="shrink-0 rounded-lg bg-zinc-800 px-3 py-2 text-zinc-100 hover:bg-zinc-700"
            >
              {layoutMode === "split" ? (
                <span className="inline-flex flex-col items-center gap-1">
                  <span className="h-1.5 w-4 rounded-sm border border-current" />
                  <span className="h-1.5 w-4 rounded-sm border border-current" />
                </span>
              ) : (
                <span className="inline-flex items-center gap-1">
                  <span className="h-3 w-2 rounded-sm border border-current" />
                  <span className="h-3 w-2 rounded-sm border border-current" />
                </span>
              )}
            </button>
          </div>

            <div className="mt-3 flex flex-col gap-2">
              <label htmlFor="zip-upload" className="text-sm text-zinc-200">
                Or select a ZIP file (.mp4/.webm/.webp/.html):
              </label>
              <input
                id="zip-upload"
                type="file"
                accept=".zip"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) {
                    return;
                  }
                  void loadZipFile(file);
                }}
                className="block w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 file:mr-4 file:cursor-pointer file:rounded-md file:border-0 file:bg-zinc-700 file:px-3 file:py-2 file:text-zinc-100"
              />
            </div>

            {zipFileName ? (
              <p className="mt-2 text-sm text-zinc-300">
                Selected ZIP:
                {" "}
                <span className="font-medium text-zinc-100">{zipFileName}</span>
              </p>
            ) : null}

            {isZipLoading ? <p className="mt-2 text-sm text-cyan-300">Extracting ZIP...</p> : null}
            {zipError ? <p className="mt-2 text-sm text-amber-300">{zipError}</p> : null}

            {zipItems.length > 0 ? (
              <div className="mt-3 flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm text-zinc-200">Files in ZIP:</p>
                </div>
                {layoutMode === "split" ? (
                  <div className="max-h-[520px] overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-950 p-3">
                    <div className="flex flex-col gap-2">
                      {zipItems.map((item, index) => {
                        const meta = parseItemMeta(item.name);
                        const palette = ITEM_PALETTE[index % ITEM_PALETTE.length];

                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                              setSelectedZipId(item.id);
                              resetPlayerState();
                            }}
                            style={{
                              borderColor: selectedZipId === item.id ? "#22d3ee" : palette.border,
                              backgroundColor: selectedZipId === item.id ? "#1f2937" : palette.background,
                            }}
                            className="rounded-lg border px-4 py-3 text-left transition"
                          >
                            {item.type !== "html" ? (
                              <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide">
                                <span className="rounded px-2 py-0.5 font-semibold" style={{ color: palette.accent, backgroundColor: "rgba(255,255,255,0.06)" }}>
                                  ID: {meta.testId}
                                </span>
                                <span className="rounded bg-zinc-800 px-2 py-0.5 text-zinc-300">
                                  Device: {meta.device}
                                </span>
                              </div>
                            ) : null}
                            {item.type === "html" ? (
                              <p className="mt-2 text-sm text-zinc-100">
                                <span className="block font-medium">Test Run Report</span>
                                <span className="block truncate text-zinc-300">{item.name}</span>
                              </p>
                            ) : (
                              <p className="mt-2 truncate text-sm text-zinc-100">{getDisplayFileName(item.name, meta.testId)}</p>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-zinc-700 bg-zinc-950 p-3">
                    <div className="flex min-w-max gap-2">
                      {zipItems.map((item, index) => {
                        const meta = parseItemMeta(item.name);
                        const palette = ITEM_PALETTE[index % ITEM_PALETTE.length];

                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                              setSelectedZipId(item.id);
                              resetPlayerState();
                            }}
                            style={{
                              borderColor: selectedZipId === item.id ? "#22d3ee" : palette.border,
                              backgroundColor: selectedZipId === item.id ? "#1f2937" : palette.background,
                            }}
                            className="rounded-lg border px-4 py-3 text-left transition"
                          >
                            {item.type !== "html" ? (
                              <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide">
                                <span className="rounded px-2 py-0.5 font-semibold" style={{ color: palette.accent, backgroundColor: "rgba(255,255,255,0.06)" }}>
                                  ID: {meta.testId}
                                </span>
                                <span className="rounded bg-zinc-800 px-2 py-0.5 text-zinc-300">
                                  Device: {meta.device}
                                </span>
                              </div>
                            ) : null}
                            {item.type === "html" ? (
                              <p className="mt-2 w-56 text-sm text-zinc-100">
                                <span className="block font-medium">Test Run Report</span>
                                <span className="block truncate text-zinc-300">{item.name}</span>
                              </p>
                            ) : (
                              <p className="mt-2 w-56 truncate text-sm text-zinc-100">{getDisplayFileName(item.name, meta.testId)}</p>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                <p className="text-xs text-zinc-400">When ZIP is selected, ZIP files take priority over querystring media.</p>
              </div>
            ) : null}
          </div>

          <div className="flex flex-col gap-6">
            <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-black">
              {selectedZipItem && isHtmlMode ? (
                <div className="grid gap-0 md:grid-cols-[1.5fr_1fr]">
                  <div className="min-h-[520px] border-b border-zinc-800 md:border-b-0 md:border-r">
                    <div className="border-b border-zinc-800 bg-zinc-900 px-4 py-2 text-xs uppercase tracking-wide text-zinc-300">
                      HTML Preview
                    </div>
                    <iframe
                      ref={iframeRef}
                      title={`html-preview-${selectedZipItem.name}`}
                      srcDoc={selectedZipItem.htmlContent ?? ""}
                      sandbox="allow-scripts allow-same-origin allow-forms"
                      className="h-[470px] w-full bg-white"
                    />
                  </div>
                  <div className="min-h-[520px] bg-zinc-950">
                    <div className="border-b border-zinc-800 bg-zinc-900 px-4 py-2 text-xs uppercase tracking-wide text-zinc-300">
                      HTML Review
                    </div>
                    <div className="space-y-3 p-4 text-sm text-zinc-200">
                      <p><span className="text-zinc-400">File:</span> {selectedZipItem.name}</p>
                      <p className="text-zinc-400">
                        This is HTML review mode. You can inspect rendered layout in the left iframe.
                      </p>
                      <p className="text-zinc-400">
                        Note: if HTML depends on relative assets (css/js/image) inside ZIP, `srcDoc` may not resolve all assets.
                      </p>
                    </div>
                  </div>
                </div>
              ) : currentMediaUrl && currentMediaType === "mp4" ? (
                <video
                  key={currentMediaUrl}
                  ref={videoRef}
                  className="h-auto w-full"
                  preload="metadata"
                >
                  <source src={currentMediaUrl} type={currentVideoMimeType} />
                </video>
              ) : currentMediaUrl && currentMediaType === "webm" ? (
                <video
                  key={currentMediaUrl}
                  ref={videoRef}
                  className="h-auto w-full"
                  preload="metadata"
                >
                  <source src={currentMediaUrl} type={currentVideoMimeType} />
                </video>
              ) : currentMediaUrl && currentMediaType === "webp" ? (
                <Image
                  src={currentMediaUrl}
                  alt="Selected webp"
                  width={1920}
                  height={1080}
                  unoptimized
                  className="h-auto w-full object-contain"
                  ref={imageRef}
                />
              ) : (
                <div className="flex h-[420px] items-center justify-center px-6 text-center text-zinc-300">
                  No media selected. Add
                  {" "}
                  <code className="mx-1 rounded bg-zinc-800 px-2 py-1">?video=...</code>
                  {" "}
                  or upload a ZIP file to review.
                </div>
              )}
            </div>

            {!isHtmlMode ? (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
            <div
              ref={sliderRef}
              className={`relative h-3 w-full rounded-full bg-zinc-700 ${currentMediaUrl && isReady && isVideoMode ? "cursor-pointer" : "cursor-not-allowed opacity-70"}`}
              onPointerDown={(event) => {
                if (!currentMediaUrl || !isReady || !isVideoMode) {
                  return;
                }
                setIsDragging(true);
                updateTimeFromPointer(event.clientX);
              }}
              onPointerMove={(event) => {
                if (!isDragging) {
                  return;
                }
                updateTimeFromPointer(event.clientX);
              }}
              onPointerUp={() => setIsDragging(false)}
              onPointerLeave={() => setIsDragging(false)}
            >
              <div
                className="absolute left-0 top-0 h-full rounded-full bg-cyan-400"
                style={{ width: `${progressPercent}%` }}
              />
              <div
                className="absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full border-2 border-cyan-100 bg-cyan-500 shadow-md"
                style={{ left: `calc(${progressPercent}% - 10px)` }}
              />
            </div>

            <div className="mt-3 flex items-center justify-between text-sm text-zinc-300">
              <span>{isVideoMode ? formatTime(currentTime) : "00:00"}</span>
              <span>{isVideoMode ? formatTime(duration) : "00:00"}</span>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={togglePlayPause}
                disabled={!currentMediaUrl || !isReady || !isVideoMode}
                className="rounded-lg bg-cyan-500 px-4 py-2 font-medium text-zinc-950 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPlaying ? "Pause" : "Play"}
              </button>

              <button
                type="button"
                onClick={captureScreenshot}
                disabled={!currentMediaUrl || (!isReady && isVideoMode)}
                className="rounded-lg bg-zinc-700 px-4 py-2 font-medium text-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Capture Screenshot
              </button>

              <button
                type="button"
                onClick={() => {
                  void toggleFullscreen();
                }}
                disabled={!currentMediaUrl}
                className="rounded-lg bg-zinc-700 px-4 py-2 font-medium text-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
              </button>

              {SEEK_VALUES.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => seek(value)}
                  disabled={!currentMediaUrl || !isReady || !isVideoMode}
                  className="rounded-lg bg-zinc-800 px-3 py-2 text-sm font-medium text-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {value > 0 ? `+${value}s` : `${value}s`}
                </button>
              ))}
            </div>

            {!isVideoMode && currentMediaType === "webp" ? (
              <p className="mt-3 text-xs text-zinc-400">WEBP mode: play/seek controls are disabled for still images.</p>
            ) : null}

                {captureMessage ? (
                  <p className="mt-3 text-sm text-amber-300">{captureMessage}</p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-zinc-950 text-zinc-100">
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
            <h1 className="text-2xl font-semibold">Video Review Tool</h1>
            <p className="text-sm text-zinc-300">Loading interface...</p>
          </div>
        </main>
      }
    >
      <VideoReviewPage />
    </Suspense>
  );
}
