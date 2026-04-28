import { useEffect } from "react";
import Image from "next/image";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { type ZipItemType, type ZipMediaItem } from "./types";

type MediaDisplayProps = {
  selectedZipItem: ZipMediaItem | null;
  isHtmlMode: boolean;
  isMarkdownMode: boolean;
  currentMediaUrl: string;
  currentMediaType: ZipItemType | null;
  currentVideoMimeType?: string;
  isTestRunPreview: boolean;
  onDocumentLinkClick: (href: string, linkText?: string) => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  imageRef: React.RefObject<HTMLImageElement | null>;
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
};

export function MediaDisplay({
  selectedZipItem,
  isHtmlMode,
  isMarkdownMode,
  currentMediaUrl,
  currentMediaType,
  currentVideoMimeType,
  isTestRunPreview,
  onDocumentLinkClick,
  videoRef,
  imageRef,
  iframeRef,
}: MediaDisplayProps) {
  useEffect(() => {
    if (!selectedZipItem || !isHtmlMode || !isTestRunPreview) {
      return;
    }

    const iframe = iframeRef.current;
    if (!iframe) {
      return;
    }

    let currentDoc: Document | null = null;
    const onDocClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const anchor = target?.closest("a");
      if (!anchor) {
        return;
      }

      const href = anchor.getAttribute("href");
      if (!href) {
        return;
      }

      event.preventDefault();
      onDocumentLinkClick(href, anchor.textContent?.trim());
    };

    const bindDoc = () => {
      const doc = iframe.contentDocument;
      if (!doc || currentDoc === doc) {
        return;
      }

      if (currentDoc) {
        currentDoc.removeEventListener("click", onDocClick);
      }
      currentDoc = doc;
      currentDoc.addEventListener("click", onDocClick);
    };

    iframe.addEventListener("load", bindDoc);
    bindDoc();

    return () => {
      iframe.removeEventListener("load", bindDoc);
      if (currentDoc) {
        currentDoc.removeEventListener("click", onDocClick);
      }
    };
  }, [iframeRef, isHtmlMode, isTestRunPreview, onDocumentLinkClick, selectedZipItem]);

  return (
    <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-zinc-800 bg-black">
      {selectedZipItem && isHtmlMode ? (
        <div className="flex h-full min-h-[520px] flex-col">
          <div className="border-b border-zinc-800 bg-zinc-900 px-4 py-2 text-xs uppercase tracking-wide text-zinc-300">HTML Preview</div>
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
          <div className="border-b border-zinc-800 bg-zinc-900 px-4 py-2 text-xs uppercase tracking-wide text-zinc-300">Markdown Preview</div>
          <div className="h-full flex-1 overflow-auto p-4 text-sm text-zinc-200">
            <div className="space-y-4 [&_a]:text-cyan-300 [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-zinc-700 [&_blockquote]:pl-3 [&_code]:rounded [&_code]:bg-zinc-800 [&_code]:px-1.5 [&_code]:py-0.5 [&_h1]:text-2xl [&_h1]:font-semibold [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:text-lg [&_h3]:font-semibold [&_hr]:border-zinc-700 [&_li]:ml-5 [&_ol]:list-decimal [&_pre]:overflow-auto [&_pre]:rounded-lg [&_pre]:bg-zinc-900 [&_pre]:p-3 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-zinc-700 [&_td]:px-3 [&_td]:py-2 [&_th]:border [&_th]:border-zinc-700 [&_th]:bg-zinc-900 [&_th]:px-3 [&_th]:py-2 [&_ul]:list-disc">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{selectedZipItem.htmlContent ?? ""}</ReactMarkdown>
            </div>
          </div>
        </div>
      ) : currentMediaUrl && currentMediaType === "mp4" ? (
        <video key={currentMediaUrl} ref={videoRef} className="h-auto w-full" preload="metadata">
          <source src={currentMediaUrl} type={currentVideoMimeType} />
        </video>
      ) : currentMediaUrl && currentMediaType === "webm" ? (
        <video key={currentMediaUrl} ref={videoRef} className="h-auto w-full" preload="metadata">
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
        <div className="flex h-[420px] items-center justify-center px-6 text-center text-zinc-300">No media selected. Upload a ZIP file to review.</div>
      )}
    </div>
  );
}
