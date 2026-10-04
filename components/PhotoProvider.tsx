"use client";

import Image from "next/image";
import { createContext, useContext, useEffect, useState, type CSSProperties } from "react";
import { getPhotoPositionsAction, getPhotosAction } from "@/app/actions";
import type { PhotoPosition } from "@/lib/types";

type Ctx = { photos: Record<string, string>; positions: Record<string, PhotoPosition> };

const PhotoContext = createContext<Ctx>({ photos: {}, positions: {} });

export function PhotoProvider({ children }: { children: React.ReactNode }) {
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [positions, setPositions] = useState<Record<string, PhotoPosition>>({});

  useEffect(() => {
    getPhotosAction().then(setPhotos);
    getPhotoPositionsAction().then(setPositions);
  }, []);

  return <PhotoContext.Provider value={{ photos, positions }}>{children}</PhotoContext.Provider>;
}

/** Returns the admin-set URL for a photo slot, or "" if nothing's been uploaded yet. */
export function usePhoto(slot: string): string {
  const { photos } = useContext(PhotoContext);
  return photos[slot] || "";
}

/** Returns the admin-set crop focal point for a photo slot, defaulting to centered. */
export function usePhotoPosition(slot: string): PhotoPosition {
  const { positions } = useContext(PhotoContext);
  return positions[slot] || { x: 50, y: 50 };
}

/** Same as usePhoto — kept as an alias so "is a photo set for this slot" reads clearly at call sites. */
export function useHasPhoto(slot: string): string | null {
  const { photos } = useContext(PhotoContext);
  return photos[slot] || null;
}

/**
 * Renders a photo from an admin-set override (uploaded via /admin, any URL).
 * Slots start empty — no bundled defaults — so until one's set, this shows a
 * "No photo yet" placeholder instead. `fill`-style, absolutely positioned —
 * wrap it in a `position: relative` box with a set size, same as next/image.
 */
export function SitePhoto({
  slot,
  alt = "",
  className,
  style,
  sizes = "100vw",
  priority,
  placeholder = "No photo yet",
}: {
  slot: string;
  alt?: string;
  className?: string;
  style?: CSSProperties;
  sizes?: string;
  priority?: boolean;
  placeholder?: string;
}) {
  const src = usePhoto(slot);
  const pos = usePhotoPosition(slot);
  if (!src) {
    return (
      <div
        className="absolute inset-0 flex items-center justify-center text-center"
        style={{ background: "var(--c-panel)", color: "var(--c-muted)", fontSize: 13, padding: 16, ...style }}
      >
        {placeholder}
      </div>
    );
  }
  const positionedStyle = { objectPosition: `${pos.x}% ${pos.y}%`, ...style };
  if (src.startsWith("/")) {
    return <Image src={src} alt={alt} fill priority={priority} sizes={sizes} className={className} style={positionedStyle} />;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className={`absolute inset-0 w-full h-full ${className || ""}`} style={positionedStyle} />;
}
