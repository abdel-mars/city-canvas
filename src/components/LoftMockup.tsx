import React, { useRef, useState } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { Sparkles, Eye, Maximize } from "lucide-react";

interface LoftMockupProps {
  svgRef: React.RefObject<SVGSVGElement | null>;
  cityName: string;
  roadColor: string;
  backgroundColor: string;
  textColor: string;
}

export const LoftMockup: React.FC<LoftMockupProps> = ({
  svgRef,
  cityName,
  roadColor,
  backgroundColor,
  textColor,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);

  // Motion values for subtle 3D parallax tilt on mouse move
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  // Smooth springs to dampen the tilt action
  const springConfig = { damping: 25, stiffness: 120, mass: 0.5 };
  const rotateX = useSpring(useTransform(y, [-0.5, 0.5], [10, -10]), springConfig);
  const rotateY = useSpring(useTransform(x, [-0.5, 0.5], [-10, 10]), springConfig);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    
    // Normalize coordinates to range [-0.5, 0.5]
    const normalizedX = (e.clientX - rect.left) / width - 0.5;
    const normalizedY = (e.clientY - rect.top) / height - 0.5;
    
    x.set(normalizedX);
    y.set(normalizedY);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    x.set(0);
    y.set(0);
  };

  // Convert SVG ref to a clean inline serialization so we can display it safely inside our mockup
  // If the ref isn't available, we show a premium loading fallback
  const getSvgContent = () => {
    if (!svgRef.current) return null;
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(svgRef.current);
    const encoded = encodeURIComponent(svgStr);
    return `data:image/svg+xml;utf8,${encoded}`;
  };

  const svgDataUrl = getSvgContent();

  return (
    <div className="w-full flex flex-col items-center gap-4">
      {/* Header Badge */}
      <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400 text-xs">
        <Sparkles className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
        <span>3D Studio Preview</span>
      </div>

      {/* Loft Perspective Container */}
      <div
        ref={containerRef}
        onMouseMove={handleMouseMove}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={handleMouseLeave}
        className="relative w-full h-[400px] sm:h-[480px] rounded-3xl overflow-hidden bg-gradient-to-b from-stone-100 to-stone-200 shadow-2xl flex items-center justify-center p-6 cursor-pointer border border-stone-300/40 select-none group"
        style={{ perspective: 1200 }}
      >
        {/* Plaster Wall Texture & Lighting Overlay */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.75)_0%,rgba(0,0,0,0.06)_100%)] pointer-events-none" />
        {/* Soft Shadow from hypothetical Window Frame */}
        <div className="absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-stone-900/10 pointer-events-none" />
        
        {/* Elegant Floor Molding at the bottom for architectural depth */}
        <div className="absolute bottom-0 inset-x-0 h-10 bg-gradient-to-b from-stone-300 to-stone-400 border-t border-stone-300 shadow-inner flex items-center px-6 justify-between text-[10px] text-stone-500 font-mono pointer-events-none">
          <span>OAK FLOORS & PLASTER WALLS</span>
          <span>CITY LINES STUDIO</span>
        </div>

        {/* 3D Tilted Framed Artwork */}
        <motion.div
          style={{
            rotateX: rotateX,
            rotateY: rotateY,
            transformStyle: "preserve-3d",
          }}
          className="relative w-[220px] h-[310px] sm:w-[260px] sm:h-[360px] bg-[#fbfbfa] rounded-sm p-4 shadow-[15px_25px_45px_rgba(0,0,0,0.22),_0_5px_15px_rgba(0,0,0,0.08)] flex items-center justify-center border-4 border-stone-900 transition-shadow duration-300 group-hover:shadow-[25px_40px_70px_rgba(0,0,0,0.3),_0_10px_25px_rgba(0,0,0,0.12)]"
        >
          {/* Inner Poster Passe-Partout Mat Board (Slight bevel and cream color) */}
          <div className="absolute inset-2 border border-stone-300 bg-white shadow-inner flex items-center justify-center p-2.5 overflow-hidden">
            
            {/* The Live Rendering Poster Canvas */}
            {svgDataUrl ? (
              <img
                src={svgDataUrl}
                alt={cityName}
                className="w-full h-full object-contain pointer-events-none"
              />
            ) : (
              <div className="w-full h-full bg-stone-50 animate-pulse flex items-center justify-center text-xs text-stone-400">
                Compiling map...
              </div>
            )}

            {/* Premium glare/reflection sweep */}
            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-white/20 opacity-40 mix-blend-overlay pointer-events-none" />
          </div>

          {/* Depth effect: thickness of the physical wood frame */}
          <div className="absolute top-0 bottom-0 -left-1 w-1 bg-stone-950 shadow-md transform -skew-y-3 pointer-events-none" />
          <div className="absolute left-0 right-0 -bottom-1 h-1 bg-stone-950 shadow-md transform -skew-x-3 pointer-events-none" />
        </motion.div>

        {/* Subtle Ambient Instruction HUD overlay */}
        <div className="absolute top-4 right-4 bg-zinc-950/70 backdrop-blur-md border border-zinc-800/80 px-2.5 py-1.5 rounded-xl text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center gap-1.5 text-[10px]">
          <Eye className="w-3.5 h-3.5 text-indigo-400" />
          <span>Interactive 3D Perspective</span>
        </div>
      </div>
    </div>
  );
};
