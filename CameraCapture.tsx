import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Camera, X, Zap, ZapOff } from 'lucide-react';
import { translations, Language } from '../translations';
import { BrowserMultiFormatReader } from '@zxing/library';

interface CameraCaptureProps {
  onCapture: (base64Image: string) => void;
  onBarcodeDetected?: (barcode: string) => void;
  onCancel: () => void;
  title: string;
  lang: Language;
}

export function CameraCapture({ onCapture, onBarcodeDetected, onCancel, title, lang }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string>('');
  const [isFlashOn, setIsFlashOn] = useState(false);
  const isFlashOnRef = useRef(false);
  const [hasTorch, setHasTorch] = useState(false);
  const codeReaderRef = useRef<BrowserMultiFormatReader | null>(null);
  
  const t = translations[lang];

  const startCamera = useCallback(async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } } 
      });
      setStream(mediaStream);
      streamRef.current = mediaStream;
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      
      const track = mediaStream.getVideoTracks()[0];
      if (track) {
        const capabilities = track.getCapabilities ? track.getCapabilities() : {} as any;
        if ('torch' in capabilities) {
          setHasTorch(true);
        }
        
        // Explicitly set zoom to 1 (normal) so it doesn't inherit scan camera's zoom
        if (capabilities.zoom && track.readyState === 'live') {
          const minZoom = capabilities.zoom.min || 1;
          track.applyConstraints({ advanced: [{ zoom: minZoom } as any] }).catch(() => {});
        }
      }
    } catch (err) {
      console.error('Error accessing camera:', err);
      setError(t.cameraError);
    }
  }, [t.cameraError]);

  useEffect(() => {
    if (stream && onBarcodeDetected && videoRef.current) {
      if (!codeReaderRef.current) {
        codeReaderRef.current = new BrowserMultiFormatReader();
      }
      let detected = false;
      let animationFrameId: number;

      const scanFrame = () => {
        if (!detected && videoRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
          try {
            const result = codeReaderRef.current?.decode(videoRef.current);
            if (result) {
              const text = result.getText();
              if (text.length > 5) {
                detected = true;
                onBarcodeDetected(text);
              }
            }
          } catch (e) {
            // zxing throws exceptions when a barcode is not found in the frame.
            // This is expected, so we ignore it.
          }
        }
        if (!detected) {
          animationFrameId = requestAnimationFrame(scanFrame);
        }
      };

      const handlePlay = () => {
        scanFrame();
      };

      videoRef.current.addEventListener('play', handlePlay);
      
      // If it's already playing
      if (videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA && !videoRef.current.paused) {
          scanFrame();
      }

      return () => {
        videoRef.current?.removeEventListener('play', handlePlay);
        if (animationFrameId) {
          cancelAnimationFrame(animationFrameId);
        }
      };
    }
  }, [stream, onBarcodeDetected]);

  useEffect(() => {
    startCamera();
    return () => {
      if (codeReaderRef.current) {
        codeReaderRef.current.reset();
      }
      const currentStream = streamRef.current;
      if (currentStream) {
        if (isFlashOnRef.current) {
          const track = currentStream.getVideoTracks()[0];
          if (track && track.readyState === 'live') {
            track.applyConstraints({ advanced: [{ torch: false }] } as any).catch(() => {});
          }
        }
        currentStream.getTracks().forEach(track => {
          try {
            track.stop();
          } catch (err) {
            console.error('Error stopping track:', err);
          }
        });
      }
    };
  }, [startCamera]);

  const toggleFlash = async () => {
    if (stream) {
      const track = stream.getVideoTracks()[0];
      if (track && track.readyState === 'live') {
        try {
          await track.applyConstraints({
            advanced: [{ torch: !isFlashOn }]
          } as any);
          setIsFlashOn(!isFlashOn);
          isFlashOnRef.current = !isFlashOn;
        } catch (err) {
          // console.error('Error toggling flash:', err);
        }
      }
    }
  };

  const handleCancelLocal = () => {
    if (stream) {
      if (isFlashOnRef.current) {
        const track = stream.getVideoTracks()[0];
        if (track && track.readyState === 'live') {
          track.applyConstraints({ advanced: [{ torch: false }] } as any).catch(() => {});
        }
      }
      stream.getTracks().forEach(track => {
        try { track.stop(); } catch (e) {}
      });
    }
    onCancel();
  };

  const handleCapture = async () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      
      const MAX_DIMENSION = 512;
      let width = video.videoWidth;
      let height = video.videoHeight;
      
      if (width > height) {
        if (width > MAX_DIMENSION) {
          height = Math.round(height * (MAX_DIMENSION / width));
          width = MAX_DIMENSION;
        }
      } else {
        if (height > MAX_DIMENSION) {
          width = Math.round(width * (MAX_DIMENSION / height));
          height = MAX_DIMENSION;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, width, height);
        const base64Image = canvas.toDataURL('image/jpeg', 0.8);
        
        if (stream) {
          if (isFlashOnRef.current) {
            const track = stream.getVideoTracks()[0];
            if (track && track.readyState === 'live') {
              track.applyConstraints({ advanced: [{ torch: false }] } as any).catch(() => {});
            }
          }
          stream.getTracks().forEach(track => {
            try { track.stop(); } catch (e) {}
          });
        }
        
        onCapture(base64Image);
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col items-center justify-center font-sans">
      {!error && (
        <video 
           ref={videoRef} 
           autoPlay 
           playsInline 
           className="absolute inset-0 w-full h-full object-contain z-0 bg-black"
        />
      )}

      <div className="absolute top-6 flex w-full max-w-md justify-center items-center px-6 z-10 text-white drop-shadow-md">
        <h2 className="text-2xl font-black er uppercase">{title}</h2>
      </div>

      {error ? (
        <div className="text-white text-center p-6 border-4 border-red-500 mx-4 z-10 bg-black/80">
          <p className="mb-6 font-bold uppercase  text-sm">{error}</p>
          <button onClick={startCamera} className="bg-white text-slate-900 px-8 py-3 font-black uppercase  text-xs hover:bg-slate-200 rounded-2xl">
            {t.tryAgain}
          </button>
        </div>
      ) : (
        <div className="absolute inset-0 pointer-events-none z-0">
          <div className="absolute inset-0 border-t-4 border-b-4 border-emerald-500/50 pointer-events-none animate-pulse opacity-50" />
        </div>
      )}

      <div className="absolute bottom-12 flex items-center justify-center gap-6 w-full max-w-md px-6 z-10">
        <button 
           onClick={handleCancelLocal} 
           className="p-4 border-4 border-white/40 hover:border-white transition-colors text-white rounded-full flex items-center justify-center bg-black/40 backdrop-blur-sm"
        >
          <X className="w-8 h-8" />
        </button>
        
        <button 
           onClick={handleCapture}
          className="p-6 bg-white text-slate-900 hover:scale-105 transition-transform active:scale-95 shadow-[0px_4px_16px_rgba(0,0,0,0.5)] flex items-center justify-center rounded-full mx-2"
        >
          <Camera className="w-10 h-10" />
        </button>

        {hasTorch ? (
          <button 
             onClick={toggleFlash} 
             className={`p-4 border-4 transition-colors ${isFlashOn ? 'border-yellow-400 text-yellow-400 bg-yellow-400/20' : 'border-white/40 hover:border-white text-white'} flex items-center justify-center rounded-full bg-black/40 backdrop-blur-sm`}
          >
            {isFlashOn ? <Zap className="w-8 h-8" /> : <ZapOff className="w-8 h-8" />}
          </button>
        ) : (
          <div className="w-[72px] h-[72px]" />
        )}
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
