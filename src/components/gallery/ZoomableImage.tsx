import React, { useRef, useState } from 'react';
import { Locale, translateInline } from '../../utils/i18n';

type Point = { x: number; y: number };
type Gesture = { distance: number; midpoint: Point; scale: number; offset: Point };

interface ZoomableImageProps {
  src: string;
  alt: string;
  locale: Locale;
  onNaturalSize?: (width: number, height: number) => void;
}

const clampScale = (value: number) => Math.min(6, Math.max(1, value));
const pointDistance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

export const ZoomableImage: React.FC<ZoomableImageProps> = ({ src, alt, locale, onNaturalSize }) => {
  const tx = (source: string) => translateInline(locale, source);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<Gesture | null>(null);
  const dragStart = useRef<{ point: Point; offset: Point } | null>(null);

  const reset = () => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
    gesture.current = null;
    dragStart.current = null;
  };

  const onPointerDown = (event: React.PointerEvent<HTMLImageElement>) => {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 1) {
      dragStart.current = { point: { x: event.clientX, y: event.clientY }, offset };
    } else if (pointers.current.size === 2) {
      const [a, b] = Array.from(pointers.current.values());
      gesture.current = { distance: Math.max(1, pointDistance(a, b)), midpoint: midpoint(a, b), scale, offset };
      dragStart.current = null;
    }
  };

  const onPointerMove = (event: React.PointerEvent<HTMLImageElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    event.stopPropagation();
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size >= 2 && gesture.current) {
      const [a, b] = Array.from(pointers.current.values());
      const center = midpoint(a, b);
      const origin = gesture.current;
      setScale(clampScale(origin.scale * pointDistance(a, b) / origin.distance));
      setOffset({ x: origin.offset.x + center.x - origin.midpoint.x, y: origin.offset.y + center.y - origin.midpoint.y });
    } else if (scale > 1 && dragStart.current) {
      setOffset({ x: dragStart.current.offset.x + event.clientX - dragStart.current.point.x, y: dragStart.current.offset.y + event.clientY - dragStart.current.point.y });
    }
  };

  const onPointerEnd = (event: React.PointerEvent<HTMLImageElement>) => {
    pointers.current.delete(event.pointerId);
    gesture.current = null;
    if (pointers.current.size === 1) {
      const [point] = Array.from(pointers.current.values());
      dragStart.current = { point, offset };
    } else {
      dragStart.current = null;
    }
  };

  return (
    <div className="flex max-h-[82vh] max-w-[96vw] flex-col items-center gap-2" onClick={event => event.stopPropagation()}>
      <div className="flex max-h-[75vh] max-w-[96vw] items-center justify-center overflow-hidden rounded-xl">
        <img
          src={src}
          alt={alt}
          draggable={false}
          onLoad={event => onNaturalSize?.(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          onLostPointerCapture={onPointerEnd}
          onDoubleClick={() => scale > 1 ? reset() : setScale(2)}
          className="max-h-[75vh] max-w-[96vw] select-none object-contain"
          style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`, transformOrigin: 'center center', touchAction: 'none', cursor: scale > 1 ? 'grab' : 'zoom-in' }}
        />
      </div>
      <span className="text-[11px] text-white/60">{tx('可双指捏合缩放，单指拖动；双击重置')}</span>
    </div>
  );
};
