
import React, { useRef } from 'react';
import { Maximize, Upload, ShieldAlert } from 'lucide-react';

interface VideoPlayerProps {
    src: string;
    watermarkUrl?: string;
    canDownload?: boolean;
    isVideoDeleted?: boolean;
    videoDeletedReason?: string;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({ src, watermarkUrl, canDownload = true, isVideoDeleted, videoDeletedReason }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);

    const toggleFullscreen = () => {
        if (!containerRef.current) return;

        if (!document.fullscreenElement) {
            containerRef.current.requestFullscreen().catch(err => {
                console.error(`Error attempting to enable fullscreen: ${err.message}`);
                // Fallback video
                if (videoRef.current) videoRef.current.requestFullscreen();
            });
        } else {
            document.exitFullscreen();
        }
    };

    return (
        <div className="flex flex-col">
            <style>
                {`
                /* Hide native fullscreen button to force using our container fullscreen */
                video::-webkit-media-controls-fullscreen-button {
                    display: none !important;
                }
                `}
            </style>
            
            {/* Player Container */}
            <div 
                ref={containerRef} 
                className="relative w-full max-w-sm mx-auto rounded-2xl shadow-xl overflow-hidden bg-black aspect-[9/16] group flex flex-col justify-center items-center"
            >
                {isVideoDeleted ? (
                    <div className="flex flex-col items-center justify-center p-6 text-center space-y-4">
                        <div className="w-14 h-14 rounded-full bg-red-950/60 border border-red-500/20 flex items-center justify-center text-red-500 mb-1">
                            <ShieldAlert className="w-7 h-7" />
                        </div>
                        <h4 className="text-xs font-black text-slate-200 uppercase tracking-widest text-[10px]">Contenuto Rimosso</h4>
                        <div className="bg-red-500/5 border border-red-500/10 rounded-2xl p-4 max-w-[240px]">
                            <p className="text-rose-400 text-xs font-bold leading-normal">
                                Contenuto eliminato dai moderatori per: <span className="text-white block mt-1 font-medium italic">"{videoDeletedReason || 'non specificato'}"</span>
                            </p>
                        </div>
                    </div>
                ) : (
                    <>
                        <video 
                            ref={videoRef}
                            controls 
                            className="w-full h-full object-contain"
                            // nodownload + noremoteplayback helps cleanup UI
                            controlsList="nodownload noremoteplayback" 
                        >
                            <source src={src} />
                            Il tuo browser non supporta il video tag.
                        </video>

                        {/* Custom Fullscreen Trigger */}
                        <button 
                            onClick={toggleFullscreen}
                            className="absolute top-2 right-2 bg-black/50 text-white p-1.5 rounded-md opacity-0 group-hover:opacity-100 transition-opacity z-30 hover:bg-black/80"
                            title="Schermo Intero"
                        >
                            <Maximize className="w-4 h-4" />
                        </button>
                    </>
                )}
            </div>

            {/* Download Link */}
            {canDownload && !isVideoDeleted && (
                <a 
                    href={src} 
                    download={`ciaostar_video_${Date.now()}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center text-slate-900 hover:text-slate-700 text-sm font-bold underline mt-3 mb-4 w-fit"
                >
                    <Upload className="w-4 h-4 mr-1 rotate-180" /> Scarica Video
                </a>
            )}
        </div>
    );
};

export default VideoPlayer;
