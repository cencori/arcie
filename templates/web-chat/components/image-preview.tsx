"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { FileText, ImageIcon, X, Download, ZoomIn } from "lucide-react";
import type { UiFile } from "@/lib/types";

interface ImagePreviewProps {
  file: UiFile;
  onRemove?: () => void;
  chip?: boolean;
  className?: string;
}

function Spinner({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      fill="currentColor"
      viewBox="0 0 256 256"
      className={cn("animate-spin", className)}
    >
      <path d="M134,32V64a6,6,0,0,1-12,0V32a6,6,0,0,1,12,0Zm39.25,56.75A6,6,0,0,0,177.5,87l22.62-22.63a6,6,0,0,0-8.48-8.48L169,78.5a6,6,0,0,0,4.24,10.25ZM224,122H192a6,6,0,0,0,0,12h32a6,6,0,0,0,0-12Zm-46.5,47A6,6,0,0,0,169,177.5l22.63,22.62a6,6,0,0,0,8.48-8.48ZM128,186a6,6,0,0,0-6,6v32a6,6,0,0,0,12,0V192A6,6,0,0,0,128,186ZM78.5,169,55.88,191.64a6,6,0,1,0,8.48,8.48L87,177.5A6,6,0,1,0,78.5,169ZM70,128a6,6,0,0,0-6-6H32a6,6,0,0,0,0,12H64A6,6,0,0,0,70,128ZM64.36,55.88a6,6,0,0,0-8.48,8.48L78.5,87A6,6,0,1,0,87,78.5Z" />
    </svg>
  );
}

export function ImagePreview({ file, onRemove, chip, className }: ImagePreviewProps) {
  const isImage = file.type.startsWith("image/");
  const [zoom, setZoom] = React.useState(false);

  if (chip) {
    return (
      <div
        className={cn(
          "group relative flex items-center gap-1.5 rounded-lg border border-border/30 bg-card/60 px-2 py-1 text-[11px] font-medium text-foreground",
          className,
        )}
      >
        <div className="relative h-5 w-5 shrink-0">
          {isImage ? (
            <>
              <img
                src={file.dataUrl}
                alt={file.name}
                className={cn(
                  "h-5 w-5 rounded object-cover",
                  file.loading && "opacity-30",
                )}
              />
              {file.loading && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Spinner className="h-3 w-3 text-muted-foreground" />
                </div>
              )}
            </>
          ) : (
            <FileText className="h-3.5 w-3.5 text-muted-foreground/70" />
          )}
        </div>
        <span className="max-w-[140px] truncate">{file.name}</span>
        {onRemove && !file.loading && (
          <button
            type="button"
            onClick={onRemove}
            className="ml-0.5 text-muted-foreground/50 hover:text-foreground transition-colors"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
    );
  }

  if (!isImage) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-lg border border-border/30 bg-card/40 px-3 py-2.5 text-sm",
          className,
        )}
      >
        <FileText className="h-4 w-4 text-muted-foreground/60" />
        <span className="text-muted-foreground truncate">{file.name}</span>
        <span className="text-[11px] text-muted-foreground/40 ml-auto">
          {(file.size / 1024).toFixed(1)} KB
        </span>
      </div>
    );
  }

  return (
    <>
      <div className={cn("group relative w-fit max-w-full", className)}>
        <div className="relative">
          <img
            src={file.dataUrl}
            alt={file.name}
            className={cn(
              "max-h-64 max-w-full rounded-xl border border-border/20 object-contain bg-muted/10 transition-all",
              file.loading ? "opacity-30" : "cursor-pointer hover:shadow-md",
            )}
            onClick={() => !file.loading && setZoom(true)}
          />
          {file.loading && (
            <div className="absolute inset-0 flex items-center justify-center rounded-xl">
              <Spinner className="h-8 w-8 text-muted-foreground/70" />
            </div>
          )}
        </div>
        {!file.loading && (
          <button
            type="button"
            onClick={() => setZoom(true)}
            className="absolute top-2 right-2 h-7 w-7 flex items-center justify-center rounded-full bg-background/70 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity"
            title="View full size"
          >
            <ZoomIn className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        )}
      </div>

      {zoom && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setZoom(false)}
        >
          <div
            className="relative max-h-[90vh] max-w-[90vw]"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={file.dataUrl}
              alt={file.name}
              className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
            />
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-full bg-background/80 backdrop-blur-sm px-3 py-1.5 text-xs text-muted-foreground">
              <ImageIcon className="h-3 w-3" />
              <span>{file.name}</span>
              <a
                href={file.dataUrl}
                download={file.name}
                className="ml-2 text-foreground hover:text-primary transition-colors"
                title="Download"
              >
                <Download className="h-3 w-3" />
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
