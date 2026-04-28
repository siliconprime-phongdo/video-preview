import { type MediaType, type ZipMediaItem } from "./types";

export const SEEK_VALUES = [-10, -5, -2, -1, 1, 2, 5, 10];

export const ITEM_PALETTE = [
  { border: "#334155", background: "#0f172a", accent: "#38bdf8" },
  { border: "#3f3f46", background: "#18181b", accent: "#f59e0b" },
  { border: "#3f3f46", background: "#1c1917", accent: "#f472b6" },
  { border: "#374151", background: "#111827", accent: "#34d399" },
  { border: "#44403c", background: "#1c1917", accent: "#a78bfa" },
];

export function getMimeType(type: MediaType): string {
  if (type === "mp4") {
    return "video/mp4";
  }
  if (type === "webm") {
    return "video/webm";
  }
  return "image/webp";
}

export function getMediaErrorMessage(error: MediaError | null): string {
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

export function formatTime(seconds: number): string {
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

export function parseItemMeta(fileName: string): { testId: string; device: string } {
  const idMatch = fileName.match(/(TC[-_\s]?\d+|TEST[-_\s]?\d+|[A-Z]{2,}-\d+|\b\d{4,}\b)/i);
  const deviceMatch = fileName.match(/\((mobile|desktop)\)/i);

  return {
    testId: idMatch ? idMatch[1].replace(/\s+/g, "") : "N/A",
    device: deviceMatch ? deviceMatch[1].toUpperCase() : "UNKNOWN",
  };
}

export function getDisplayFileName(fileName: string, testId: string): string {
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

export function getItemOrder(item: ZipMediaItem): number {
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

export function getReviewTitle(item: ZipMediaItem): string {
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
