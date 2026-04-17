import { type RefObject, useEffect, useRef } from "react";
import type { AxisTick } from "../../../shared/lib/axis-ticks";

export interface AxisCanvasOptions {
  color?: string;
  font?: string;
}

function redraw(
  canvas: HTMLCanvasElement,
  ticksRef: RefObject<AxisTick[]>,
  colorRef: RefObject<string>,
  fontRef: RefObject<string>,
  drawFn: (ctx: CanvasRenderingContext2D, ticks: AxisTick[], rect: DOMRect, color: string, font: string) => void,
): void {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  drawFn(ctx, ticksRef.current ?? [], rect, colorRef.current ?? "", fontRef.current ?? "");
}

/**
 * Draws y-axis tick labels on a canvas (right-aligned, vertically centered).
 * Canvas must be placed to the LEFT of the chart with matching height.
 */
export function useYAxisCanvas(
  ticks: AxisTick[],
  options: AxisCanvasOptions = {},
): RefObject<HTMLCanvasElement> {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const color = options.color ?? "rgba(255,255,255,0.7)";
  const font = options.font ?? "10px sans-serif";

  const ticksRef = useRef(ticks);
  ticksRef.current = ticks;
  const colorRef = useRef(color);
  colorRef.current = color;
  const fontRef = useRef(font);
  fontRef.current = font;

  // ResizeObserver: mounted once, always reads latest ticks/color/font via refs
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => redraw(canvas, ticksRef, colorRef, fontRef, drawY));
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  // Redraw whenever ticks or style change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) redraw(canvas, ticksRef, colorRef, fontRef, drawY);
  }, [ticks, color, font]);

  return canvasRef;
}

/**
 * Draws x-axis tick labels on a canvas (horizontally centered).
 * Canvas must be placed BELOW the chart with matching width.
 */
export function useXAxisCanvas(
  ticks: AxisTick[],
  options: AxisCanvasOptions = {},
): RefObject<HTMLCanvasElement> {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const color = options.color ?? "rgba(255,255,255,0.7)";
  const font = options.font ?? "10px sans-serif";

  const ticksRef = useRef(ticks);
  ticksRef.current = ticks;
  const colorRef = useRef(color);
  colorRef.current = color;
  const fontRef = useRef(font);
  fontRef.current = font;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => redraw(canvas, ticksRef, colorRef, fontRef, drawX));
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) redraw(canvas, ticksRef, colorRef, fontRef, drawX);
  }, [ticks, color, font]);

  return canvasRef;
}

function drawY(
  ctx: CanvasRenderingContext2D,
  ticks: AxisTick[],
  rect: DOMRect,
  color: string,
  font: string,
): void {
  const { width: w, height: h } = rect;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = color;
  ctx.font = font;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (const tick of ticks) {
    // fraction 0 = bottom, 1 = top; canvas y is flipped
    const y = (1 - tick.fraction) * h;
    ctx.fillText(tick.label, w - 4, y);
  }
}

function drawX(
  ctx: CanvasRenderingContext2D,
  ticks: AxisTick[],
  rect: DOMRect,
  color: string,
  font: string,
): void {
  const { width: w, height: h } = rect;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = color;
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (const tick of ticks) {
    const x = tick.fraction * w;
    ctx.fillText(tick.label, x, 4);
  }
}
