import { SEEK_VALUES, formatTime } from "./utils";

type MediaControlsProps = {
  currentMediaUrl: string;
  isReady: boolean;
  isVideoMode: boolean;
  isPlaying: boolean;
  duration: number;
  currentTime: number;
  progressPercent: number;
  isDragging: boolean;
  isFullscreen: boolean;
  currentMediaType: "mp4" | "webm" | "webp" | "html" | "md" | null;
  captureMessage: string | null;
  sliderRef: React.RefObject<HTMLDivElement | null>;
  onSetDragging: (value: boolean) => void;
  onUpdateTimeFromPointer: (clientX: number) => void;
  onTogglePlayPause: () => void;
  onCaptureScreenshot: () => void;
  onToggleFullscreen: () => void;
  onSeek: (value: number) => void;
};

export function MediaControls({
  currentMediaUrl,
  isReady,
  isVideoMode,
  isPlaying,
  duration,
  currentTime,
  progressPercent,
  isDragging,
  isFullscreen,
  currentMediaType,
  captureMessage,
  sliderRef,
  onSetDragging,
  onUpdateTimeFromPointer,
  onTogglePlayPause,
  onCaptureScreenshot,
  onToggleFullscreen,
  onSeek,
}: MediaControlsProps) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <div
        ref={sliderRef}
        className={`relative h-3 w-full rounded-full bg-zinc-700 ${currentMediaUrl && isReady && isVideoMode ? "cursor-pointer" : "cursor-not-allowed opacity-70"}`}
        onPointerDown={(event) => {
          if (!currentMediaUrl || !isReady || !isVideoMode) {
            return;
          }
          onSetDragging(true);
          onUpdateTimeFromPointer(event.clientX);
        }}
        onPointerMove={(event) => {
          if (!isDragging) {
            return;
          }
          onUpdateTimeFromPointer(event.clientX);
        }}
        onPointerUp={() => onSetDragging(false)}
        onPointerLeave={() => onSetDragging(false)}
      >
        <div className="absolute left-0 top-0 h-full rounded-full bg-cyan-400" style={{ width: `${progressPercent}%` }} />
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
          onClick={onTogglePlayPause}
          disabled={!currentMediaUrl || !isReady || !isVideoMode}
          className="rounded-lg bg-cyan-500 px-4 py-2 font-medium text-zinc-950 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPlaying ? "Pause" : "Play"}
        </button>

        <button
          type="button"
          onClick={onCaptureScreenshot}
          disabled={!currentMediaUrl || (!isReady && isVideoMode)}
          className="rounded-lg bg-zinc-700 px-4 py-2 font-medium text-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Capture Screenshot
        </button>

        <button
          type="button"
          onClick={onToggleFullscreen}
          disabled={!currentMediaUrl}
          className="rounded-lg bg-zinc-700 px-4 py-2 font-medium text-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
        </button>

        {SEEK_VALUES.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => onSeek(value)}
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

      {captureMessage ? <p className="mt-3 text-sm text-amber-300">{captureMessage}</p> : null}
    </div>
  );
}
