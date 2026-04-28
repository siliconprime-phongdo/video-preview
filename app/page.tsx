"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import JSZip from "jszip";
import Image from "next/image";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const SEEK_VALUES = [-10, -5, -2, -1, 1, 2, 5, 10];
type MediaType = "mp4" | "webm" | "webp";
type ZipItemType = MediaType | "html" | "md";

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

function getBaseName(filePath: string): string {
  const parts = filePath.split("/");
  return (parts[parts.length - 1] ?? filePath).toLowerCase();
}

function getItemOrder(item: ZipMediaItem): number {
  const baseName = getBaseName(item.name);
  if (baseName === "playwright-report-index.html" || baseName === "playwright-report-index.htm") {
    return 0;
  }
  if (baseName === "test-run-preview.html" || baseName === "test-run-preview.htm") {
    return 1;
  }
  if (baseName === "testcases.md") {
    return 2;
  }
  return 3;
}

function getReviewTitle(item: ZipMediaItem): string {
  const baseName = getBaseName(item.name);
  if (baseName === "playwright-report-index.html" || baseName === "playwright-report-index.htm") {
    return "Test Run Summary";
  }
  if (baseName === "test-run-preview.html" || baseName === "test-run-preview.htm") {
    return "Test Run Preview";
  }
  if (baseName === "testcases.md") {
    return "Testcases";
  }
  return item.type === "html" || item.type === "md" ? "Test Run Report" : item.name;
}

function VideoReviewPage() {
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
  const [layoutMode] = useState<"split" | "stacked">("split");
  const [isFullscreen, setIsFullscreen] = useState(false);

  const selectedZipItem = zipItems.find((item) => item.id === selectedZipId) ?? null;
  const currentMediaUrl = selectedZipItem?.url ?? "";
  const currentMediaType: ZipItemType | null = selectedZipItem?.type ?? null;
  const isHtmlMode = currentMediaType === "html";
  const isMarkdownMode = currentMediaType === "md";
  const isDocumentMode = isHtmlMode || isMarkdownMode;
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
        setCaptureMessage("Unable to play video. Check the file format or browser autoplay policy.");
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
            : lowerName.endsWith(".md")
              ? "md"
            : null;

        if (!type) {
          continue;
        }

        if (type === "html" || type === "md") {
          const textContent = await entry.async("string");
          items.push({
            id: `${entry.name}-${items.length}`,
            name: entry.name,
            type,
            url: "",
            htmlContent: textContent,
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
        setZipError("No .mp4/.webm/.webp/.html/.md files found in ZIP.");
        return;
      }

      const sortedItems = [...items].sort((a, b) => {
        const orderDiff = getItemOrder(a) - getItemOrder(b);
        if (orderDiff !== 0) {
          return orderDiff;
        }
        return a.name.localeCompare(b.name);
      });

      const firstHtml = sortedItems.find((item) => item.type === "html" || item.type === "md");
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
    <main className="h-dvh overflow-hidden bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex h-full w-full flex-col gap-4 px-3 py-3 md:gap-4 md:px-4 md:py-4 xl:px-5">
        <div className={`grid min-h-0 flex-1 gap-4 ${layoutMode === "split" ? "md:grid-cols-[360px_1fr]" : "grid-cols-1"}`}>
          <div className="flex min-h-0 flex-col overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <div className="flex items-start gap-3">
            <p className="text-sm text-zinc-300">Upload a ZIP file to start reviewing media.</p>
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
              <div className="mt-3 flex min-h-0 flex-1 flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm text-zinc-200">Files in ZIP:</p>
                </div>
                {layoutMode === "split" ? (
                  <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-950 p-3">
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
                            {item.type !== "html" && item.type !== "md" ? (
                              <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide">
                                <span className="rounded px-2 py-0.5 font-semibold" style={{ color: palette.accent, backgroundColor: "rgba(255,255,255,0.06)" }}>
                                  ID: {meta.testId}
                                </span>
                                <span className="rounded bg-zinc-800 px-2 py-0.5 text-zinc-300">
                                  Device: {meta.device}
                                </span>
                              </div>
                            ) : null}
                            {item.type === "html" || item.type === "md" ? (
                              <p className="mt-2 text-sm text-zinc-100">
                                <span className={`block text-base font-bold tracking-tight ${item.type === "html" ? "text-sky-200" : "text-emerald-200"}`}>
                                  {getReviewTitle(item)}
                                </span>
                                <span className="block truncate text-xs text-zinc-400">{item.name}</span>
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
                            {item.type !== "html" && item.type !== "md" ? (
                              <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide">
                                <span className="rounded px-2 py-0.5 font-semibold" style={{ color: palette.accent, backgroundColor: "rgba(255,255,255,0.06)" }}>
                                  ID: {meta.testId}
                                </span>
                                <span className="rounded bg-zinc-800 px-2 py-0.5 text-zinc-300">
                                  Device: {meta.device}
                                </span>
                              </div>
                            ) : null}
                            {item.type === "html" || item.type === "md" ? (
                              <p className="mt-2 w-56 text-sm text-zinc-100">
                                <span className={`block text-base font-bold tracking-tight ${item.type === "html" ? "text-sky-200" : "text-emerald-200"}`}>
                                  {getReviewTitle(item)}
                                </span>
                                <span className="block truncate text-xs text-zinc-400">{item.name}</span>
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
                <p className="text-xs text-zinc-400">ZIP supports `.mp4`, `.webm`, `.webp`, and `.html` files.</p>
              </div>
            ) : null}
          </div>

          <div className="flex min-h-0 flex-col gap-4">
            <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-zinc-800 bg-black">
              {selectedZipItem && isHtmlMode ? (
                <div className="flex h-full min-h-[520px] flex-col">
                  <div className="border-b border-zinc-800 bg-zinc-900 px-4 py-2 text-xs uppercase tracking-wide text-zinc-300">
                    HTML Preview
                  </div>
                  <iframe
                    ref={iframeRef}
                    title={`html-preview-${selectedZipItem.name}`}
                    srcDoc={selectedZipItem.htmlContent ?? ""}
                    sandbox="allow-scripts allow-same-origin allow-forms"
                    className="h-full w-full flex-1 bg-white"
                  />
                </div>
              ) : selectedZipItem && isMarkdownMode ? (
                <div className="flex h-full min-h-[520px] flex-col">
                  <div className="border-b border-zinc-800 bg-zinc-900 px-4 py-2 text-xs uppercase tracking-wide text-zinc-300">
                    Markdown Preview
                  </div>
                  <div className="h-full flex-1 overflow-auto p-4 text-sm text-zinc-200">
                    <div className="space-y-4 [&_a]:text-cyan-300 [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-zinc-700 [&_blockquote]:pl-3 [&_code]:rounded [&_code]:bg-zinc-800 [&_code]:px-1.5 [&_code]:py-0.5 [&_h1]:text-2xl [&_h1]:font-semibold [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:text-lg [&_h3]:font-semibold [&_hr]:border-zinc-700 [&_li]:ml-5 [&_ol]:list-decimal [&_pre]:overflow-auto [&_pre]:rounded-lg [&_pre]:bg-zinc-900 [&_pre]:p-3 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-zinc-700 [&_td]:px-3 [&_td]:py-2 [&_th]:border [&_th]:border-zinc-700 [&_th]:bg-zinc-900 [&_th]:px-3 [&_th]:py-2 [&_ul]:list-disc">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {selectedZipItem.htmlContent ?? ""}
                      </ReactMarkdown>
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
                  No media selected. Upload a ZIP file to review.
                </div>
              )}
            </div>

            {!isDocumentMode ? (
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
            <h1 className="text-2xl font-semibold">E2E Review</h1>
            <p className="text-sm text-zinc-300">Loading interface...</p>
          </div>
        </main>
      }
    >
      <VideoReviewPage />
    </Suspense>
  );
}
