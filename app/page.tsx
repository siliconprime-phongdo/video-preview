"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import JSZip from "jszip";
import Image from "next/image";
import { MediaControls } from "./components/review/MediaControls";
import { MediaDisplay } from "./components/review/MediaDisplay";
import { ZipSidebar } from "./components/review/ZipSidebar";
import { type ZipItemType, type ZipMediaItem } from "./components/review/types";
import { getItemOrder, getMediaErrorMessage, getMimeType, getReviewTitle } from "./components/review/utils";

type LinkedAsset = {
  url: string;
  kind: "video" | "image";
  name: string;
};

type ModalAsset = LinkedAsset & {
  title: string;
};

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
  const [linkedAssets, setLinkedAssets] = useState<Record<string, LinkedAsset>>({});
  const [modalAsset, setModalAsset] = useState<ModalAsset | null>(null);
  const modalVideoRef = useRef<HTMLVideoElement | null>(null);
  const modalSliderRef = useRef<HTMLDivElement | null>(null);
  const [modalIsReady, setModalIsReady] = useState(false);
  const [modalIsPlaying, setModalIsPlaying] = useState(false);
  const [modalDuration, setModalDuration] = useState(0);
  const [modalCurrentTime, setModalCurrentTime] = useState(0);
  const [modalIsDragging, setModalIsDragging] = useState(false);
  const [modalCaptureMessage, setModalCaptureMessage] = useState<string | null>(null);
  const [isModalFullscreen, setIsModalFullscreen] = useState(false);

  const selectedZipItem = zipItems.find((item) => item.id === selectedZipId) ?? null;
  const currentMediaUrl = selectedZipItem?.url ?? "";
  const currentMediaType: ZipItemType | null = selectedZipItem?.type ?? null;
  const isHtmlMode = currentMediaType === "html";
  const isMarkdownMode = currentMediaType === "md";
  const isDocumentMode = isHtmlMode || isMarkdownMode;
  const isVideoMode = currentMediaType === "mp4" || currentMediaType === "webm";
  const isTestRunPreview = selectedZipItem ? getReviewTitle(selectedZipItem) === "Test Run Preview" : false;
  const currentVideoMimeType = isVideoMode && currentMediaType ? getMimeType(currentMediaType) : undefined;

  const progressPercent = useMemo(() => {
    if (!isVideoMode || duration <= 0) {
      return 0;
    }
    return Math.min(100, Math.max(0, (currentTime / duration) * 100));
  }, [currentTime, duration, isVideoMode]);
  const modalProgressPercent = useMemo(() => {
    if (modalAsset?.kind !== "video" || modalDuration <= 0) {
      return 0;
    }
    return Math.min(100, Math.max(0, (modalCurrentTime / modalDuration) * 100));
  }, [modalAsset?.kind, modalCurrentTime, modalDuration]);

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

  const normalizePath = useCallback((value: string): string => value
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/^\/+/, "")
    .trim()
    .toLowerCase(), []);

  const getAssetMimeType = useCallback((fileName: string): string => {
    const lowerName = fileName.toLowerCase();
    if (lowerName.endsWith(".mp4")) return "video/mp4";
    if (lowerName.endsWith(".webm")) return "video/webm";
    if (lowerName.endsWith(".webp")) return "image/webp";
    if (lowerName.endsWith(".png")) return "image/png";
    if (lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")) return "image/jpeg";
    if (lowerName.endsWith(".gif")) return "image/gif";
    return "application/octet-stream";
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
    setModalAsset(null);
    setModalCaptureMessage(null);

    try {
      revokeGeneratedUrls();

      const zip = await JSZip.loadAsync(file);
      const items: ZipMediaItem[] = [];
      const nextLinkedAssets: Record<string, LinkedAsset> = {};
      const entries = Object.values(zip.files).filter((entry) => !entry.dir);

      const registerLinkedAsset = (entryName: string, asset: LinkedAsset) => {
        const normalizedFullPath = normalizePath(entryName);
        const baseName = normalizedFullPath.split("/").pop() ?? normalizedFullPath;
        nextLinkedAssets[normalizedFullPath] = asset;
        nextLinkedAssets[baseName] = asset;
      };

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
          registerLinkedAsset(entry.name, {
            url: objectUrl,
            kind: type === "webp" ? "image" : "video",
            name: entry.name,
          });

          items.push({
            id: `${entry.name}-${items.length}`,
            name: entry.name,
            type,
            url: objectUrl,
          });
        }

        if (!type && (lowerName.endsWith(".png") || lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg") || lowerName.endsWith(".gif"))) {
          const blob = await entry.async("blob");
          const typedBlob = new Blob([blob], { type: getAssetMimeType(entry.name) });
          const objectUrl = URL.createObjectURL(typedBlob);
          generatedUrlsRef.current.push(objectUrl);
          registerLinkedAsset(entry.name, {
            url: objectUrl,
            kind: "image",
            name: entry.name,
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
      setLinkedAssets(nextLinkedAssets);
      setSelectedZipId(firstHtml ? firstHtml.id : sortedItems[0].id);
      setZipFileName(file.name);
      setZipError(null);
    } catch {
      setZipError("ZIP extraction failed. Please verify the ZIP file.");
    } finally {
      setIsZipLoading(false);
    }
  }, [getAssetMimeType, normalizePath, resetPlayerState, revokeGeneratedUrls]);

  const resolveLinkedAsset = useCallback((href: string): LinkedAsset | null => {
    if (!href || href.startsWith("http://") || href.startsWith("https://") || href.startsWith("#")) {
      return null;
    }
    const hrefWithoutHash = href.split("#")[0] ?? href;
    const hrefWithoutQuery = hrefWithoutHash.split("?")[0] ?? hrefWithoutHash;
    const normalizedHref = normalizePath(decodeURIComponent(hrefWithoutQuery));
    if (!normalizedHref) {
      return null;
    }
    if (linkedAssets[normalizedHref]) {
      return linkedAssets[normalizedHref];
    }
    const baseName = normalizedHref.split("/").pop() ?? normalizedHref;
    if (linkedAssets[baseName]) {
      return linkedAssets[baseName];
    }
    return null;
  }, [linkedAssets, normalizePath]);

  const findVideoByTestCaseId = useCallback((value?: string): LinkedAsset | null => {
    if (!value) {
      return null;
    }
    const match = value.match(/(TC[-_\s]?\d+|TEST[-_\s]?\d+|[A-Z]{2,}-\d+|\b\d{4,}\b)/i);
    if (!match) {
      return null;
    }
    const normalizedId = match[1].replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
    const videoItem = zipItems.find((item) => (item.type === "mp4" || item.type === "webm")
      && normalizePath(item.name).replace(/[^a-zA-Z0-9]/g, "").includes(normalizedId));
    if (!videoItem) {
      return null;
    }
    return {
      url: videoItem.url,
      kind: "video",
      name: videoItem.name,
    };
  }, [normalizePath, zipItems]);

  const handleDocumentLinkClick = useCallback((href: string, linkText?: string) => {
    const linked = resolveLinkedAsset(href) ?? findVideoByTestCaseId(linkText) ?? findVideoByTestCaseId(href);
    if (!linked) {
      setCaptureMessage(`No matching evidence found for link: ${href}`);
      return;
    }
    setModalAsset({
      ...linked,
      title: linked.kind === "video" ? "Video Evidence" : "Image Evidence",
    });
    setModalCaptureMessage(null);
  }, [findVideoByTestCaseId, resolveLinkedAsset]);

  const updateModalTimeFromPointer = useCallback((pointerClientX: number) => {
    const sliderElement = modalSliderRef.current;
    const videoElement = modalVideoRef.current;
    if (!sliderElement || !videoElement || modalDuration <= 0) {
      return;
    }
    const rect = sliderElement.getBoundingClientRect();
    const ratio = (pointerClientX - rect.left) / rect.width;
    const nextTime = Math.min(modalDuration, Math.max(0, ratio * modalDuration));
    videoElement.currentTime = nextTime;
    setModalCurrentTime(nextTime);
  }, [modalDuration]);

  const seekModal = useCallback((delta: number) => {
    const videoElement = modalVideoRef.current;
    if (!videoElement) {
      return;
    }
    const nextTime = Math.min(
      Number.isFinite(videoElement.duration) ? videoElement.duration : Number.MAX_SAFE_INTEGER,
      Math.max(0, videoElement.currentTime + delta),
    );
    videoElement.currentTime = nextTime;
    setModalCurrentTime(nextTime);
  }, []);

  const toggleModalPlayPause = useCallback(async () => {
    const videoElement = modalVideoRef.current;
    if (!videoElement) {
      return;
    }
    if (videoElement.paused) {
      try {
        await videoElement.play();
      } catch {
        setModalCaptureMessage("Unable to play evidence video.");
      }
      return;
    }
    videoElement.pause();
  }, []);

  const captureModalScreenshot = useCallback(() => {
    if (!modalAsset) {
      return;
    }
    if (modalAsset.kind === "image") {
      const anchor = document.createElement("a");
      anchor.href = modalAsset.url;
      anchor.download = `evidence-${Date.now()}.png`;
      anchor.click();
      setModalCaptureMessage("Image evidence downloaded.");
      return;
    }
    const videoElement = modalVideoRef.current;
    if (!videoElement || !videoElement.videoWidth || !videoElement.videoHeight) {
      setModalCaptureMessage("Video evidence is not ready for capture.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setModalCaptureMessage("Failed to create canvas context.");
      return;
    }
    ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
    const url = canvas.toDataURL("image/png");
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `evidence-${Date.now()}.png`;
    anchor.click();
    setModalCaptureMessage("Evidence screenshot downloaded.");
  }, [modalAsset]);

  const toggleModalFullscreen = useCallback(async () => {
    const target = modalVideoRef.current;
    if (!target) {
      return;
    }
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    await target.requestFullscreen();
  }, []);

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
    if (modalAsset?.kind !== "video") {
      return;
    }

    const videoElement = modalVideoRef.current;
    if (!videoElement) {
      return;
    }

    const handleLoadStart = () => {
      setModalIsReady(false);
      setModalDuration(0);
      setModalCurrentTime(0);
      setModalIsPlaying(false);
      setModalCaptureMessage(null);
    };
    const handleLoadedMetadata = () => {
      setModalDuration(Number.isFinite(videoElement.duration) ? videoElement.duration : 0);
      setModalIsReady(true);
      setModalCurrentTime(videoElement.currentTime || 0);
      void videoElement.play().catch(() => {
        setModalCaptureMessage("Autoplay was blocked in popup. Press Play to start.");
      });
    };
    const handleTimeUpdate = () => {
      if (!modalIsDragging) {
        setModalCurrentTime(videoElement.currentTime || 0);
      }
    };
    const handlePlay = () => setModalIsPlaying(true);
    const handlePause = () => setModalIsPlaying(false);
    const handleEnded = () => setModalIsPlaying(false);
    const handleError = () => setModalCaptureMessage(getMediaErrorMessage(videoElement.error));

    videoElement.addEventListener("loadstart", handleLoadStart);
    videoElement.addEventListener("loadedmetadata", handleLoadedMetadata);
    videoElement.addEventListener("timeupdate", handleTimeUpdate);
    videoElement.addEventListener("play", handlePlay);
    videoElement.addEventListener("pause", handlePause);
    videoElement.addEventListener("ended", handleEnded);
    videoElement.addEventListener("error", handleError);

    videoElement.load();

    return () => {
      videoElement.removeEventListener("loadstart", handleLoadStart);
      videoElement.removeEventListener("loadedmetadata", handleLoadedMetadata);
      videoElement.removeEventListener("timeupdate", handleTimeUpdate);
      videoElement.removeEventListener("play", handlePlay);
      videoElement.removeEventListener("pause", handlePause);
      videoElement.removeEventListener("ended", handleEnded);
      videoElement.removeEventListener("error", handleError);
    };
  }, [modalAsset, modalIsDragging]);

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
        || document.fullscreenElement === iframeRef.current
        || document.fullscreenElement === modalVideoRef.current;
      setIsFullscreen(mediaFullscreen);
      setIsModalFullscreen(document.fullscreenElement === modalVideoRef.current);
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
          <ZipSidebar
            zipFileName={zipFileName}
            isZipLoading={isZipLoading}
            zipError={zipError}
            zipItems={zipItems}
            selectedZipId={selectedZipId}
            layoutMode={layoutMode}
            onFileSelect={(file) => {
              void loadZipFile(file);
            }}
            onSelectItem={(id) => {
              setSelectedZipId(id);
              resetPlayerState();
            }}
          />

          <div className="flex min-h-0 flex-col gap-4">
            <MediaDisplay
              selectedZipItem={selectedZipItem}
              isHtmlMode={isHtmlMode}
              isMarkdownMode={isMarkdownMode}
              isTestRunPreview={isTestRunPreview}
              onDocumentLinkClick={handleDocumentLinkClick}
              currentMediaUrl={currentMediaUrl}
              currentMediaType={currentMediaType}
              currentVideoMimeType={currentVideoMimeType}
              videoRef={videoRef}
              imageRef={imageRef}
              iframeRef={iframeRef}
            />

            {!isDocumentMode ? (
              <MediaControls
                currentMediaUrl={currentMediaUrl}
                isReady={isReady}
                isVideoMode={isVideoMode}
                isPlaying={isPlaying}
                duration={duration}
                currentTime={currentTime}
                progressPercent={progressPercent}
                isDragging={isDragging}
                isFullscreen={isFullscreen}
                currentMediaType={currentMediaType}
                captureMessage={captureMessage}
                sliderRef={sliderRef}
                onSetDragging={setIsDragging}
                onUpdateTimeFromPointer={updateTimeFromPointer}
                onTogglePlayPause={() => {
                  void togglePlayPause();
                }}
                onCaptureScreenshot={captureScreenshot}
                onToggleFullscreen={() => {
                  void toggleFullscreen();
                }}
                onSeek={seek}
              />
            ) : null}
          </div>
        </div>
      </div>
      {modalAsset ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="flex h-[92dvh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-950 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-zinc-100">{modalAsset.title}</p>
                <p className="text-xs text-zinc-400">{modalAsset.name}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setModalAsset(null);
                  setModalCaptureMessage(null);
                }}
                className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm text-zinc-100 hover:bg-zinc-700"
              >
                Close
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden bg-black">
              {modalAsset.kind === "video" ? (
                <video key={modalAsset.url} ref={modalVideoRef} className="h-full w-full" preload="metadata">
                  <source src={modalAsset.url} />
                </video>
              ) : (
                <Image src={modalAsset.url} alt={modalAsset.name} width={1920} height={1080} unoptimized className="h-full w-full object-contain" />
              )}
            </div>
            {modalAsset.kind === "video" ? (
              <div className="border-t border-zinc-800">
                <MediaControls
                  currentMediaUrl={modalAsset.url}
                  isReady={modalIsReady}
                  isVideoMode
                  isPlaying={modalIsPlaying}
                  duration={modalDuration}
                  currentTime={modalCurrentTime}
                  progressPercent={modalProgressPercent}
                  isDragging={modalIsDragging}
                  isFullscreen={isModalFullscreen}
                  currentMediaType="mp4"
                  captureMessage={modalCaptureMessage}
                  sliderRef={modalSliderRef}
                  onSetDragging={setModalIsDragging}
                  onUpdateTimeFromPointer={updateModalTimeFromPointer}
                  onTogglePlayPause={() => {
                    void toggleModalPlayPause();
                  }}
                  onCaptureScreenshot={captureModalScreenshot}
                  onToggleFullscreen={() => {
                    void toggleModalFullscreen();
                  }}
                  onSeek={seekModal}
                />
              </div>
            ) : (
              <div className="border-t border-zinc-800 px-4 py-3">
                <button
                  type="button"
                  onClick={captureModalScreenshot}
                  className="rounded-lg bg-zinc-700 px-4 py-2 font-medium text-zinc-100"
                >
                  Download Image
                </button>
                {modalCaptureMessage ? <p className="mt-2 text-sm text-amber-300">{modalCaptureMessage}</p> : null}
              </div>
            )}
          </div>
        </div>
      ) : null}
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
