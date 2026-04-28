export type MediaType = "mp4" | "webm" | "webp";
export type ZipItemType = MediaType | "html" | "md";

export type ZipMediaItem = {
  id: string;
  name: string;
  type: ZipItemType;
  url: string;
  htmlContent?: string;
};
