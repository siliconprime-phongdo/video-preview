import { ITEM_PALETTE, getDisplayFileName, getReviewTitle, parseItemMeta } from "./utils";
import { type ZipMediaItem } from "./types";

type ZipSidebarProps = {
  zipFileName: string | null;
  isZipLoading: boolean;
  zipError: string | null;
  zipItems: ZipMediaItem[];
  selectedZipId: string | null;
  layoutMode: "split" | "stacked";
  onFileSelect: (file: File) => void;
  onSelectItem: (id: string) => void;
};

export function ZipSidebar({
  zipFileName,
  isZipLoading,
  zipError,
  zipItems,
  selectedZipId,
  layoutMode,
  onFileSelect,
  onSelectItem,
}: ZipSidebarProps) {
  return (
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
            onFileSelect(file);
          }}
          className="block w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 file:mr-4 file:cursor-pointer file:rounded-md file:border-0 file:bg-zinc-700 file:px-3 file:py-2 file:text-zinc-100"
        />
      </div>

      {zipFileName ? (
        <p className="mt-2 text-sm text-zinc-300">
          Selected ZIP: <span className="font-medium text-zinc-100">{zipFileName}</span>
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
                      onClick={() => onSelectItem(item.id)}
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
                          <span className="rounded bg-zinc-800 px-2 py-0.5 text-zinc-300">Device: {meta.device}</span>
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
                      onClick={() => onSelectItem(item.id)}
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
                          <span className="rounded bg-zinc-800 px-2 py-0.5 text-zinc-300">Device: {meta.device}</span>
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
  );
}
