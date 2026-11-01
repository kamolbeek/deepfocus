"use client";

import { useEffect, useRef, useState } from "react";
import { createCompanion, type Mood } from "@/lib/companion-engine";

type Props = {
  mood: Mood;
  className?: string;
  heightFrac?: number;
  label?: string;
  onPoke?: () => void;
};

export default function Companion({ mood, className = "", heightFrac, label = "Kompanyon", onPoke }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const glRef = useRef<HTMLCanvasElement>(null);
  const lidRef = useRef<HTMLCanvasElement>(null);
  const backRef = useRef<HTMLCanvasElement>(null);
  const engine = useRef<ReturnType<typeof createCompanion>>(null);
  const [shadow, setShadow] = useState(0.5);

  useEffect(() => {
    if (!glRef.current || !lidRef.current || !backRef.current) return;
    const e = createCompanion({
      gl: glRef.current,
      lids: lidRef.current,
      back: backRef.current,
      heightFrac,
      onLayout: setShadow,
    });
    engine.current = e;
    return () => e?.destroy();
  }, [heightFrac]);

  useEffect(() => {
    engine.current?.setMood(mood);
  }, [mood]);

  return (
    <div
      ref={wrap}
      className={`relative select-none ${className}`}
      onPointerMove={(ev) => {
        const r = wrap.current!.getBoundingClientRect();
        engine.current?.look(((ev.clientX - r.left) / r.width - 0.5) * 2);
      }}
      onPointerLeave={() => engine.current?.look(0)}
    >
      <div
        aria-hidden="true"
        className="absolute left-1/2 -translate-x-1/2 rounded-[50%] transition-[width] duration-300"
        style={{
          bottom: "3.2%",
          height: "5%",
          width: `${Math.round(shadow * 100)}%`,
          background:
            "radial-gradient(ellipse at center, rgba(60,40,100,.30) 0%, rgba(60,40,100,.13) 42%, rgba(60,40,100,0) 72%)",
        }}
      />
      <canvas ref={backRef} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" />
      <canvas
        ref={glRef}
        role="img"
        aria-label={label}
        className="absolute inset-0 h-full w-full cursor-pointer"
        onClick={() => {
          engine.current?.poke();
          onPoke?.();
        }}
      />
      <canvas ref={lidRef} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" />
      {mood === "sleep" && (
        <div aria-hidden="true" className="pointer-events-none absolute right-[18%] top-[28%] font-bold text-[#8E8E93]">
          <span className="df-z absolute text-2xl">z</span>
          <span className="df-z absolute text-xl [animation-delay:.8s]">z</span>
          <span className="df-z absolute text-base [animation-delay:1.6s]">z</span>
        </div>
      )}
    </div>
  );
}
