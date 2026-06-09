/**
 * Servizio per il processing video lato client.
 * Aggiunge una filigrana (watermark) testuale dinamica sovraimpressa permanentemente al video.
 * Disegna la scritta lettera per lettera in base alla velocità impostata dall'admin.
 */

export const addWatermarkToVideo = async (videoFile: File, settings?: any): Promise<{ blob: Blob, extension: string }> => {
    return new Promise(async (resolve, reject) => {
        let video: HTMLVideoElement | null = null;
        let objectUrlToRevoke: string | null = null; 
        let videoUrlToRevoke: string | null = null;
        let recorder: MediaRecorder | null = null;
        let cleanupDone = false;
        
        // Timeout di sicurezza
        const timeoutId = setTimeout(() => {
            cleanup();
            reject(new Error("Timeout: Processing video troppo lento (max 60s)."));
        }, 60000);

        const cleanup = () => {
            if (cleanupDone) return;
            cleanupDone = true;
            clearTimeout(timeoutId);
            
            if (video) {
                video.pause();
                video.src = "";
                video.load();
                video.remove();
            }
            if (objectUrlToRevoke) URL.revokeObjectURL(objectUrlToRevoke);
            if (videoUrlToRevoke) URL.revokeObjectURL(videoUrlToRevoke);
        };

        try {
            console.log("VideoUtils: Inizio processing con filigrana grafica...");

            // Configurazione watermark
            const watermarkUrl = settings?.watermarkUrl;
            const hAlign = settings?.watermarkHAlign || 'centeraligned';
            const vAlign = settings?.watermarkVAlign || 'bottomalligned';
            const widthPercent = Number(settings?.watermarkWidthPercent) || 20;
            const opacity = settings?.watermarkOpacity !== undefined ? Number(settings?.watermarkOpacity) : 0.6;

            // Precaricamento dell'immagine watermark (se presente) con fallbacks e protezione crash
            let watermarkImg: HTMLImageElement | null = null;
            if (watermarkUrl) {
                try {
                    console.log("Tentativo di precaricamento della filigrana via fetch/blob...");
                    const response = await fetch(watermarkUrl, { mode: 'cors' });
                    if (!response.ok) throw new Error("Network fetch failed");
                    const blob = await response.blob();
                    const localBlobUrl = URL.createObjectURL(blob);
                    
                    watermarkImg = new Image();
                    watermarkImg.src = localBlobUrl;
                    await new Promise((resolveImg) => {
                        watermarkImg!.onload = () => {
                            console.log("Filigrana caricata con successo come blob locale.");
                            resolveImg(true);
                        };
                        watermarkImg!.onerror = () => {
                            URL.revokeObjectURL(localBlobUrl);
                            console.warn("Non è stato possibile caricare l'immagine come blob locale.");
                            resolveImg(false);
                        };
                    });
                } catch (fetchErr) {
                    console.warn("Errore fetch diretta Blob, uso fallback standard crossOrigin:", fetchErr);
                    // Fallback a caricamento diretto standard
                    watermarkImg = new Image();
                    watermarkImg.crossOrigin = 'anonymous';
                    watermarkImg.src = watermarkUrl;
                    await new Promise((resolveImg) => {
                        watermarkImg!.onload = () => {
                            console.log("Filigrana caricata con successo in modalità crossOrigin.");
                            resolveImg(true);
                        };
                        watermarkImg!.onerror = () => {
                            console.warn("Impossibile caricare l'immagine con fallback crossOrigin.");
                            watermarkImg = null; // Forza a null per evitare tentativi di disegno falliti
                            resolveImg(false);
                        };
                    });
                }
            }

            // 1. SETUP VIDEO ELEMENT
            videoUrlToRevoke = URL.createObjectURL(videoFile);
            video = document.createElement('video');
            video.crossOrigin = 'anonymous';
            video.playsInline = true;
            video.muted = true; // Necessario per autoplay
            video.preload = 'auto';
            video.src = videoUrlToRevoke;
            
            // Renderizzato ma invisibile
            video.style.position = 'fixed';
            video.style.top = '0';
            video.style.left = '0';
            video.style.opacity = '0.01'; 
            video.style.pointerEvents = 'none';
            video.style.zIndex = '-9999';
            document.body.appendChild(video);

            await new Promise((res, rej) => {
                video!.onloadedmetadata = res;
                video!.onerror = (e: any) => rej(new Error("Errore caricamento video: " + (e.target?.error?.message || "unknown")));
            });

            // 2. SETUP CANVAS (Forzato in formato verticale 9:16)
            const vW = video.videoWidth;
            const vH = video.videoHeight;
            const MAX_SIZE = 1280;

            // Determina l'altezza del canvas (limite massimo 1280, con baseline minima per garantire la qualità)
            let targetHeight = Math.min(Math.max(vH, vW), MAX_SIZE);
            if (targetHeight < 720 && Math.max(vH, vW) >= 720) {
                targetHeight = 720;
            } else if (targetHeight < 480) {
                targetHeight = 480;
            }

            // Calcola la larghezza corrispondente per il formato 9:16 verticale
            let targetWidth = Math.round(targetHeight * (9 / 16));

            // Ottimizzazione numeri pari (Even numbers) obbligatori per molti encoder di sistema
            targetWidth = targetWidth - (targetWidth % 2);
            targetHeight = targetHeight - (targetHeight % 2);

            const width = targetWidth;
            const height = targetHeight;

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
            if (!ctx) throw new Error("Canvas context failed");

            // Calcolo coordinate per inserire il video (fit-to-9:16) preservando l'aspect ratio originale (senza stretch, senza tagli)
            const canvasRatio = 9 / 16;
            const videoRatio = vW / vH;

            let dX = 0;
            let dY = 0;
            let dWidth = width;
            let dHeight = height;

            if (videoRatio > canvasRatio) {
                // Video sorgente orizzontale o quadrato (rispetto ad un contenitore 9:16 verticale)
                // Fit larghezza, ricalcola altezza centrando verticalmente (letterbox)
                dWidth = width;
                dHeight = Math.round(width / videoRatio);
                dY = Math.round((height - dHeight) / 2);
            } else {
                // Video sorgente è già 9:16 o più stretto
                // Fit altezza, ricalcola larghezza centrando orizzontalmente (pillarbox)
                dHeight = height;
                dWidth = Math.round(height * videoRatio);
                dX = Math.round((width - dWidth) / 2);
            }

            // 3. AUDIO STREAM
            let audioTrack: MediaStreamTrack | null = null;
            const captureStreamFn = (video as any).captureStream || (video as any).mozCaptureStream;
            
            if (captureStreamFn) {
                try {
                    const videoElemStream = captureStreamFn.call(video);
                    const tracks = videoElemStream.getAudioTracks();
                    if (tracks.length > 0) audioTrack = tracks[0];
                } catch (e) {
                    console.warn("Audio capture warning:", e);
                }
            }

            // 4. COMBINED STREAM
            const canvasStream = canvas.captureStream(30); // 30 FPS target
            const outputTracks = [...canvasStream.getVideoTracks()];
            if (audioTrack) {
                outputTracks.push(audioTrack);
            }
            
            const combinedStream = new MediaStream(outputTracks);

            // 5. MEDIA RECORDER
            const mimeTypes = [
                'video/mp4', // Safari
                'video/webm;codecs=vp8', // Chrome/FF
                'video/webm'
            ];
            let selectedMime = mimeTypes.find(m => MediaRecorder.isTypeSupported(m)) || '';
            if (!selectedMime) selectedMime = 'video/webm';

            recorder = new MediaRecorder(combinedStream, {
                mimeType: selectedMime,
                videoBitsPerSecond: 2500000 // 2.5 Mbps
            });

            const chunks: Blob[] = [];
            recorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) chunks.push(e.data);
            };

            recorder.onstop = () => {
                const blob = new Blob(chunks, { type: selectedMime });
                const ext = selectedMime.includes('mp4') ? 'mp4' : 'webm';
                cleanup();
                resolve({ blob, extension: ext });
            };

            recorder.onerror = (e: any) => {
                cleanup();
                reject(new Error("Recorder error: " + (e.error?.message || "unknown")));
            };

            // 6. RENDER LOOP
            const hasRVFC = 'requestVideoFrameCallback' in video;
            
            const renderFrame = () => {
                if (!video || video.paused || video.ended || cleanupDone) return;
                
                try {
                    // Pulisce il canvas con uno sfondo nero solido per contenere il video originale
                    ctx.fillStyle = '#000000';
                    ctx.fillRect(0, 0, width, height);

                    // Disegna il video originale centrato per intero, senza stretch o allungamenti, entro i confini 9:16
                    ctx.drawImage(video, dX, dY, dWidth, dHeight);

                    // Disegna l'immagine watermark (se caricata correttamente ed ha dimensioni valide)
                    if (watermarkImg && watermarkImg.complete && watermarkImg.naturalWidth > 0 && watermarkImg.naturalHeight > 0) {
                        ctx.globalAlpha = opacity;
                        
                        // Calcola larghezza e altezza in base alle impostazioni
                        const w = Math.round(width * (widthPercent / 100));
                        const imgRatio = watermarkImg.naturalWidth / watermarkImg.naturalHeight;
                        const h = imgRatio > 0 ? Math.round(w / imgRatio) : 0;
                        
                        if (w > 0 && h > 0) {
                            // Padding proporzionale alle dimensioni del Canvas (5%)
                            const paddingX = width * 0.05;
                            const paddingY = height * 0.05;
                            
                            // Allineamento Orizzontale
                            let x = paddingX;
                            if (hAlign === 'centeraligned') {
                                x = (width - w) / 2;
                            } else if (hAlign === 'rightaligned') {
                                x = width - w - paddingX;
                            }
                            
                            // Allineamento Verticale
                            let y = paddingY;
                            if (vAlign === 'centreallinement') {
                                y = (height - h) / 2;
                            } else if (vAlign === 'bottomalligned') {
                                y = height - h - paddingY;
                            }
                            
                            ctx.drawImage(watermarkImg, x, y, w, h);
                        }
                        ctx.globalAlpha = 1.0;
                    }

                    if (hasRVFC) {
                        (video as any).requestVideoFrameCallback(renderFrame);
                    } else {
                        requestAnimationFrame(renderFrame);
                    }
                } catch (err) {
                    console.error("Render Error:", err);
                }
            };

            // 7. START
            recorder.start();
            
            // Audio workaround: Autoplay
            video.muted = false; 
            try {
                await video.play();
            } catch (e) {
                console.warn("Autoplay blocked. Fallback to muted.", e);
                video.muted = true;
                await video.play();
            }

            if (hasRVFC) {
                (video as any).requestVideoFrameCallback(renderFrame);
            } else {
                renderFrame();
            }

            video.onended = () => {
                if (recorder && recorder.state !== 'inactive') {
                    recorder.stop();
                }
            };

        } catch (e: any) {
            cleanup();
            console.error("VideoUtils Critical Failure:", e);
            reject(new Error(e.message || "Errore sconosciuto processing video"));
        }
    });
};
