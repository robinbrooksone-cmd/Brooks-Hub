"use client";

import { useEffect, useRef, useState } from "react";

// Phone photos routinely come in at 15-20MB+, far past what a wedding
// website needs on screen. Shrinking client-side before upload keeps
// uploads fast on venue wifi and away from any server/storage size limits.
// If anything about decoding goes wrong (e.g. an unsupported format), we
// silently fall back to uploading the original file rather than blocking.
async function compressImage(file: File, maxDimension = 2400, quality = 0.85): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob || blob.size >= file.size) return file;
    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

type Position = { x: number; y: number };

export function Dropzone({
  imageUrl,
  onFile,
  height = 160,
  width,
  position,
  onPositionChange,
}: {
  imageUrl: string;
  onFile: (file: File) => Promise<void>;
  height?: number;
  width?: number | string;
  /** Crop focal point as percentages (0-100). Only meaningful once a photo is set. */
  position?: Position;
  /** Called once, when the user finishes dragging the photo to a new focal point. */
  onPositionChange?: (position: Position) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pos, setPos] = useState<Position>(position || { x: 50, y: 50 });
  const [repositioning, setRepositioning] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const justDragged = useRef(false);

  useEffect(() => {
    if (position) setPos(position);
  }, [position?.x, position?.y]);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("That's not an image file.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const smaller = await compressImage(file);
      await onFile(smaller);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed — try again.");
    } finally {
      setBusy(false);
    }
  };

  const posFromEvent = (clientX: number, clientY: number): Position => {
    const rect = boxRef.current!.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100));
    return { x: Math.round(x), y: Math.round(y) };
  };

  // Pointer Events cover mouse, touch, and pen through one API — plain mouse
  // listeners never fire on a phone/tablet drag, which left reposition dead
  // on touch devices (the primary way this dashboard gets used).
  const startDrag = (e: React.PointerEvent) => {
    if (!imageUrl || !onPositionChange || busy) return;
    e.preventDefault();
    e.stopPropagation();
    let moved = false;
    setRepositioning(true);
    const move = (ev: PointerEvent) => {
      moved = true;
      setPos(posFromEvent(ev.clientX, ev.clientY));
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      setRepositioning(false);
      if (moved) {
        justDragged.current = true;
        const final = posFromEvent(ev.clientX, ev.clientY);
        setPos(final);
        onPositionChange(final);
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  return (
    <div
      ref={boxRef}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        handleFile(e.dataTransfer.files?.[0]);
      }}
      onPointerDown={startDrag}
      onClick={() => {
        if (justDragged.current) {
          justDragged.current = false;
          return;
        }
        inputRef.current?.click();
      }}
      className="relative cursor-pointer"
      style={{
        width: width ?? "100%",
        height,
        borderRadius: 6,
        overflow: "hidden",
        background: "rgba(0,0,0,0.2)",
        border: `1.5px dashed ${dragOver ? "var(--c-gold)" : "rgba(203,177,144,0.25)"}`,
        transition: "border-color .15s",
        cursor: imageUrl && onPositionChange ? "move" : "pointer",
        touchAction: imageUrl && onPositionChange ? "none" : undefined,
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      {imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt=""
          draggable={false}
          className="absolute inset-0 w-full h-full object-cover"
          style={{ opacity: busy ? 0.4 : 1, objectPosition: `${pos.x}% ${pos.y}%` }}
        />
      )}
      {!imageUrl && !busy && (
        <div className="w-full h-full flex flex-col items-center justify-center text-center" style={{ padding: 10, color: "var(--c-muted)", fontSize: 12 }}>
          <div style={{ fontSize: 20, marginBottom: 4 }}>{dragOver ? "⬇" : "🖼"}</div>
          <div>Drag a photo here</div>
          <div style={{ opacity: 0.7 }}>or click to browse</div>
        </div>
      )}
      {busy && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.35)", color: "#fff", fontSize: 12, fontWeight: 700 }}>
          Uploading…
        </div>
      )}
      {imageUrl && !busy && (
        <div
          className="absolute inset-0 flex items-center justify-center text-center"
          style={{
            background: "rgba(0,0,0,0.45)",
            color: "#fff",
            fontSize: 11,
            fontWeight: 700,
            padding: 8,
            opacity: repositioning ? 1 : 0,
            transition: "opacity .15s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
          onMouseLeave={(e) => {
            if (!repositioning) e.currentTarget.style.opacity = "0";
          }}
        >
          {onPositionChange ? "Drag to reposition · click to replace" : "Drag or click to replace"}
        </div>
      )}
      {error && (
        <div className="absolute left-0 right-0" style={{ bottom: -20, fontSize: 11, color: "#e0907a" }}>
          {error}
        </div>
      )}
    </div>
  );
}
