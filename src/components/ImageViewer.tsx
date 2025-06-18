import { useState } from "react";

interface ImageViewerProps {
  src: string;
  alt: string;
}

export function ImageViewer({ src, alt }: ImageViewerProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  return (
    <>
      <div className="relative group retro-container p-2">
        <img
          src={src}
          alt={alt}
          className="max-w-sm max-h-64 cursor-pointer hover:opacity-90 transition-opacity"
          onClick={() => setIsFullscreen(true)}
        />
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="retro-container p-2">
            <svg className="w-6 h-6 retro-text" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
            </svg>
          </div>
        </div>
      </div>

      {isFullscreen && (
        <div
          className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4"
          onClick={() => setIsFullscreen(false)}
        >
          <div className="relative max-w-full max-h-full">
            <img
              src={src}
              alt={alt}
              className="max-w-full max-h-full object-contain retro-glow"
            />
            <button
              onClick={() => setIsFullscreen(false)}
              className="absolute top-4 right-4 retro-button p-2"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
