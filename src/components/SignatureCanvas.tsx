'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

export interface SignatureCanvasHandle {
  /** Clear the canvas and emit an empty string via onChange. */
  clear: () => void;
  /** Return the current signature as a PNG data URL ('' when blank). */
  toDataURL: () => string;
}

interface SignatureCanvasProps {
  /** Hydrate the canvas from a previously-captured signature (PNG data URL). */
  initialSignature?: string;
  /** Fires on stroke end with the latest data URL ('' on clear). */
  onChange?: (dataUrl: string) => void;
  /** Intrinsic canvas size — drives drawing resolution. Defaults to 600×200. */
  width?: number;
  height?: number;
  /** CSS class applied to the canvas. The parent controls display size. */
  className?: string;
  /** Disable drawing (e.g. while submitting). */
  disabled?: boolean;
}

/**
 * Shared signature-pad. Used by the progress note form (FormPageSeven) and
 * the RN co-sign modal so both render and serialize signatures the same way.
 *
 * Drawing semantics:
 *  - White canvas background, black 2px round strokes.
 *  - Supports mouse + touch; touch events call preventDefault so dragging
 *    doesn't scroll the page underneath.
 *  - Emits the canvas's PNG data URL on stroke end (mouse/touch up).
 *  - `initialSignature` is drawn into the canvas once after mount.
 */
const SignatureCanvas = forwardRef<SignatureCanvasHandle, SignatureCanvasProps>(
  function SignatureCanvas(
    { initialSignature, onChange, width = 600, height = 200, className, disabled },
    ref
  ) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const drawingRef = useRef(false);
    const hasStrokesRef = useRef(false);
    const [hydrated, setHydrated] = useState(false);

    // One-time canvas init: white background + brush settings.
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = 'black';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    }, []);

    // Hydrate from an initial signature (e.g. when editing an existing note).
    // Runs once per non-empty initialSignature value.
    useEffect(() => {
      if (hydrated) return;
      if (!initialSignature || !canvasRef.current) return;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        hasStrokesRef.current = true;
        setHydrated(true);
      };
      img.src = initialSignature;
    }, [initialSignature, hydrated]);

    useImperativeHandle(
      ref,
      () => ({
        clear: () => {
          const canvas = canvasRef.current;
          if (!canvas) return;
          const ctx = canvas.getContext('2d');
          if (!ctx) return;
          ctx.fillStyle = 'white';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          hasStrokesRef.current = false;
          onChange?.('');
        },
        toDataURL: () => {
          const canvas = canvasRef.current;
          if (!canvas || !hasStrokesRef.current) return '';
          return canvas.toDataURL();
        },
      }),
      [onChange]
    );

    // Scale event coords to the canvas's intrinsic size so strokes land
    // correctly when the canvas is CSS-resized smaller (common on mobile).
    const getPos = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      if ('touches' in e) {
        const touch = e.touches[0] || e.changedTouches[0];
        return {
          x: (touch.clientX - rect.left) * scaleX,
          y: (touch.clientY - rect.top) * scaleY,
        };
      }
      const m = e as React.MouseEvent;
      return { x: (m.clientX - rect.left) * scaleX, y: (m.clientY - rect.top) * scaleY };
    };

    const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      if (disabled) return;
      e.preventDefault();
      drawingRef.current = true;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const pos = getPos(e, canvas);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
    };

    const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      if (!drawingRef.current || disabled) return;
      e.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) return;
      const pos = getPos(e, canvas);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      hasStrokesRef.current = true;
    };

    const stopDrawing = () => {
      if (!drawingRef.current) return;
      drawingRef.current = false;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      ctx?.closePath();
      if (hasStrokesRef.current) {
        onChange?.(canvas.toDataURL());
      }
    };

    return (
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className={className}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        onTouchStart={startDrawing}
        onTouchMove={draw}
        onTouchEnd={stopDrawing}
        onTouchCancel={stopDrawing}
        style={{
          touchAction: 'none',
          cursor: disabled ? 'not-allowed' : 'crosshair',
          opacity: disabled ? 0.6 : 1,
        }}
      />
    );
  }
);

export default SignatureCanvas;
