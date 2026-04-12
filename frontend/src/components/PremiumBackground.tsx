import React from 'react';

/**
 * PremiumBackground - A premium animated liquid wave background.
 * Uses high-performance CSS animations and smooth SVG paths for the "Actually Moving" feel.
 */
const PremiumBackground: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    return (
        <div className="relative min-h-screen w-full overflow-hidden bg-[#EEF2FF]">
            {/* 1. Base Gradient Background */}
            <div className="absolute inset-0 bg-gradient-to-b from-[#EEF2FF] via-[#C7D2FE] to-[#818CF8] z-0" />

            {/* 2. Wave Animation Layers */}
            <div className="absolute inset-0 z-[1] pointer-events-none opacity-60">
                <div className="waves-container absolute bottom-[-50px] left-0 w-[400%] h-[300px]">
                    
                    {/* Layer 1: Back (Slowest) */}
                    <svg className="wave-svg wave-1 absolute bottom-0 left-0 w-full" viewBox="0 24 150 28" preserveAspectRatio="none" shapeRendering="auto">
                        <defs><path id="gentle-wave" d="M-160 44c30 0 58-18 88-18s 58 18 88 18 58-18 88-18 58 18 88 18 v44h-352z" /></defs>
                        <g className="parallax-back">
                            <use href="#gentle-wave" x="48" y="0" fill="rgba(99, 102, 241, 0.2)" />
                            <use href="#gentle-wave" x="48" y="0" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="0.5" className="wave-outline" />
                        </g>
                    </svg>

                    {/* Layer 2: Middle */}
                    <svg className="wave-svg wave-2 absolute bottom-0 left-0 w-full" viewBox="0 24 150 28" preserveAspectRatio="none" shapeRendering="auto">
                        <g className="parallax-mid">
                            <use href="#gentle-wave" x="48" y="3" fill="rgba(79, 70, 229, 0.3)" />
                            <use href="#gentle-wave" x="48" y="3" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="0.4" className="wave-outline" />
                        </g>
                    </svg>

                    {/* Layer 3: Front (Fastest) */}
                    <svg className="wave-svg wave-3 absolute bottom-0 left-0 w-full" viewBox="0 24 150 28" preserveAspectRatio="none" shapeRendering="auto">
                        <g className="parallax-front">
                            <use href="#gentle-wave" x="48" y="5" fill="rgba(67, 56, 202, 0.4)" />
                            <use href="#gentle-wave" x="48" y="5" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="0.3" className="wave-outline" />
                        </g>
                    </svg>

                    {/* Animated Fish 1 */}
                    <div className="fish-container fish-1">
                        <svg className="fish" viewBox="0 0 24 24" fill="rgba(255,255,255,0.4)">
                            <path d="M21,12C21,12 18,5 12,5C10,5 8.5,5.5 7,6.5L3,4L4,9C2,10.5 2,13.5 4,15L3,20L7,17.5C8.5,18.5 10,19 12,19C18,19 21,12 21,12Z" />
                        </svg>
                        <div className="splash"></div>
                    </div>

                    {/* Animated Fish 2 */}
                    <div className="fish-container fish-2">
                        <svg className="fish" viewBox="0 0 24 24" fill="rgba(255,255,255,0.3)">
                            <path d="M21,12C21,12 18,5 12,5C10,5 8.5,5.5 7,6.5L3,4L4,9C2,10.5 2,13.5 4,15L3,20L7,17.5C8.5,18.5 10,19 12,19C18,19 21,12 21,12Z" />
                        </svg>
                        <div className="splash"></div>
                    </div>
                </div>
            </div>

            {/* 3. Soft Gloss Overlay */}
            <div className="absolute inset-0 pointer-events-none z-[2] opacity-20 bg-gradient-to-t from-indigo-900/10 via-transparent to-white/10" />

            {/* 4. Page Content */}
            <div className="relative z-10 w-full min-h-screen flex items-center justify-center">
                <div className="card-container scale-100 transform-gpu w-full flex items-center justify-center">
                    {children}
                </div>
            </div>

            <style>{`
                .waves-container {
                    height: 45vh;
                    min-height: 250px;
                }

                .wave-svg {
                    height: 100%;
                    will-change: transform;
                    transform: translate3d(0,0,0);
                    backface-visibility: hidden;
                }

                .wave-outline {
                    /* Removed blur for GPU performance */
                    opacity: 0.6;
                }

                /* Keyframes for horizontal flow (Large shift range: -150px to 0px) */
                @keyframes wave-move-back {
                    0% { transform: translate3d(-120px, 0, 0) scaleY(1); }
                    50% { transform: translate3d(-60px, 10px, 0) scaleY(0.95); }
                    100% { transform: translate3d(-120px, 0, 0) scaleY(1); }
                }

                @keyframes wave-move-mid {
                    0% { transform: translate3d(-90px, 0, 0) scaleY(1.05); }
                    50% { transform: translate3d(-40px, -8px, 0) scaleY(1); }
                    100% { transform: translate3d(-90px, 0, 0) scaleY(1.05); }
                }

                @keyframes wave-move-front {
                    0% { transform: translate3d(-150px, 0, 0); }
                    50% { transform: translate3d(-30px, 5px, 0) scaleY(0.98); }
                    100% { transform: translate3d(-150px, 0, 0); }
                }

                .parallax-back > use {
                    animation: wave-move-back 18s linear infinite;
                }
                .parallax-mid > use {
                    animation: wave-move-mid 14s linear infinite;
                }
                .parallax-front > use {
                    animation: wave-move-front 10s linear infinite;
                }

                /* Fish Jumping Animation */
                .fish-container {
                    position: absolute;
                    width: 20px;
                    height: 20px;
                    bottom: 20%;
                    pointer-events: none;
                    opacity: 0;
                    will-change: transform, opacity;
                }

                .fish-1 { left: 25%; }
                .fish-2 { left: 65%; transform: scale(0.8); }

                .fish {
                    width: 100%;
                    height: 100%;
                    transform-origin: center;
                }

                @keyframes fish-jump-1 {
                    0% { transform: translate3d(0, 100px, 0) rotate(45deg); opacity: 0; }
                    10% { opacity: 1; }
                    40% { transform: translate3d(20px, -60px, 0) rotate(10deg); }
                    50% { transform: translate3d(30px, -70px, 0) rotate(0deg); }
                    60% { transform: translate3d(40px, -60px, 0) rotate(-10deg); }
                    90% { transform: translate3d(60px, 100px, 0) rotate(-45deg); opacity: 1; }
                    100% { transform: translate3d(65px, 110px, 0) rotate(-50deg); opacity: 0; }
                }

                @keyframes fish-jump-2 {
                    0% { transform: translate3d(0, 100px, 0) rotate(35deg); opacity: 0; }
                    15% { opacity: 1; }
                    45% { transform: translate3d(-15px, -40px, 0) rotate(5deg); }
                    50% { transform: translate3d(-20px, -50px, 0) rotate(0deg); }
                    55% { transform: translate3d(-25px, -40px, 0) rotate(-5deg); }
                    85% { transform: translate3d(-40px, 100px, 0) rotate(-35deg); opacity: 1; }
                    100% { transform: translate3d(-45px, 110px, 0) rotate(-40deg); opacity: 0; }
                }

                .fish-1 {
                    animation: fish-jump-1 4.5s ease-in-out infinite;
                    animation-delay: 5s;
                }

                .fish-2 {
                    animation: fish-jump-2 5.2s ease-in-out infinite;
                    animation-delay: 11s;
                }

                /* Splash Ripple */
                .splash {
                    position: absolute;
                    bottom: -110px;
                    left: 60px;
                    width: 30px;
                    height: 10px;
                    border: 1px solid rgba(255,255,255,0.4);
                    border-radius: 50%;
                    transform: scale(0);
                    opacity: 0;
                }

                .fish-1 .splash {
                    animation: splash-anim 4.5s infinite;
                    animation-delay: 5s;
                }

                @keyframes splash-anim {
                    0%, 88% { transform: scale(0); opacity: 0; }
                    92% { transform: scale(1); opacity: 0.5; }
                    100% { transform: scale(1.8); opacity: 0; }
                }

                .card-container {
                    perspective: 1000px;
                }
            `}</style>
        </div>
    );
};

export default PremiumBackground;
