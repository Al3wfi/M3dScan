import React, { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader, BarcodeFormat, DecodeHintType, HTMLCanvasElementLuminanceSource, BinaryBitmap, HybridBinarizer } from '@zxing/library';
import { X, Zap, ZapOff } from 'lucide-react';
import { Language } from '../translations';
import { motion } from 'motion/react';

interface BarcodeScannerProps {
  onScan: (data: string) => void;
  onCancel: () => void;
  lang: Language;
}

export function BarcodeScanner({ onScan, onCancel, lang }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string>('');
  const [torchSupported, setTorchSupported] = useState(true);
  const [torchOn, setTorchOn] = useState(false);

  const playBeep = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(800, audioCtx.currentTime); // 800 Hz
      gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
      
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.15); // 150ms beep
    } catch (e) {
      console.error("Audio beep failed", e);
    }
  };

  useEffect(() => {
    const hints = new Map();
    hints.set(DecodeHintType.TRY_HARDER, true);
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.DATA_MATRIX,
      BarcodeFormat.QR_CODE,
      BarcodeFormat.CODE_128,
      BarcodeFormat.CODE_39,
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
      BarcodeFormat.ITF
    ]);
    const codeReader = new BrowserMultiFormatReader(hints);
    let isScanning = true;
    let animationFrameId: number;
    let focusInterval: ReturnType<typeof setInterval>;

    navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'environment',
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        // Try to request continuous focus if supported
        advanced: [{ focusMode: 'continuous' } as any]
      }
    })
    .then((stream) => {
      streamRef.current = stream;
      
      const track = stream.getVideoTracks()[0];
      if (track) {
        const checkCapabilities = () => {
          try {
            const capabilities = track.getCapabilities() as any;
            if (capabilities && capabilities.torch) {
                setTorchSupported(true);
            } else if (capabilities && capabilities.torch === false || (capabilities && !('torch' in capabilities))) {
                setTorchSupported(false);
            }
            // Try to set zoom for small barcodes
            if (capabilities && capabilities.zoom && track.readyState === 'live') {
               const idealZoom = Math.max(capabilities.zoom.min || 1, Math.min(capabilities.zoom.max || 2, 2.5));
               track.applyConstraints({ advanced: [{ zoom: idealZoom } as any] }).catch(() => {});
            }
          } catch(err) {
              // getCapabilities might not be supported on all browsers
          }
        };

        checkCapabilities();
        setTimeout(checkCapabilities, 500);

        // Auto-focus periodically to catch small barcodes
        focusInterval = setInterval(async () => {
          if (!isScanning) return;
          if (track.readyState !== 'live') return;
          try {
            await track.applyConstraints({ advanced: [{ focusMode: 'single-shot' } as any] });
            setTimeout(async () => {
              try {
                if (isScanning && track.readyState === 'live') await track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as any] });
              } catch(e) {}
            }, 800);
          } catch (e) {}
        }, 3000);
      }
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      
      const scanFrame = async () => {
        if (!isScanning) return;
        if (videoRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
          try {
            if ('BarcodeDetector' in window) {
              try {
                const barcodeDetector = new (window as any).BarcodeDetector({ formats: ['data_matrix', 'qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'itf'] });
                const barcodes = await barcodeDetector.detect(videoRef.current);
                if (barcodes.length > 0) {
                  isScanning = false;
                  playBeep();
                  onScan(barcodes[0].rawValue);
                  return;
                }
              } catch (e) {
                // Barcode detector failed
              }
            }
            
            // Try ZXing if BarcodeDetector didn't return early
            const canvas = document.createElement('canvas');
            const cw = videoRef.current.videoWidth;
            const ch = videoRef.current.videoHeight;
            canvas.width = cw;
            canvas.height = ch;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            
            if (ctx) {
              const decodeCanvas = (c: HTMLCanvasElement, invert = false) => {
                 let luminanceSource: any = new HTMLCanvasElementLuminanceSource(c);
                 if (invert) {
                    luminanceSource = luminanceSource.invert();
                 }
                 const binaryBitmap = new BinaryBitmap(new HybridBinarizer(luminanceSource));
                 return codeReader.decodeBitmap(binaryBitmap);
              };

              // 1. Try standard ZXing directly from video
              try {
                const result = codeReader.decode(videoRef.current);
                if (result) {
                    isScanning = false;
                    playBeep();
                    onScan(result.getText());
                    return;
                }
              } catch(e) {}
              
              // Draw raw frame
              ctx.filter = 'none';
              ctx.drawImage(videoRef.current, 0, 0, cw, ch);

              // 2. Try Inverted natively via ZXing
              try {
                const resultInv = decodeCanvas(canvas, true);
                if (resultInv) {
                    isScanning = false;
                    playBeep();
                    onScan(resultInv.getText());
                    return;
                }
              } catch(e) {}

              // 3. Dotted DataMatrix support: blur and high contrast
              ctx.filter = 'blur(1px) contrast(200%)';
              ctx.drawImage(videoRef.current, 0, 0, cw, ch);
              
              try {
                const resultDotted = decodeCanvas(canvas, false);
                if (resultDotted) {
                    isScanning = false;
                    playBeep();
                    onScan(resultDotted.getText());
                    return;
                }
              } catch(e) {}

              // 4. Inverted dotted DataMatrix natively via ZXing
              try {
                const resultInvDotted = decodeCanvas(canvas, true);
                if (resultInvDotted) {
                    isScanning = false;
                    playBeep();
                    onScan(resultInvDotted.getText());
                    return;
                }
              } catch(e) {}
            }
          } catch (err) {
            // No barcode found in this frame, ignore and continue
          }
        }
        animationFrameId = requestAnimationFrame(scanFrame);
      };

      if (videoRef.current) {
          videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play().then(() => {
               scanFrame();
            }).catch(console.error);
         };
      }
    })
    .catch((err) => {
      console.error(err);
      setError(lang === 'ar' ? 'تعذر الوصول للكاميرا' : 'Camera access failed');
    });

    return () => {
      isScanning = false;
      if (focusInterval) clearInterval(focusInterval);
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => {
          if (track.readyState === 'live') {
            try {
              track.applyConstraints({ advanced: [{ torch: false }] as any }).catch(() => {});
            } catch (e) {}
          }
          track.stop();
        });
      }
      codeReader.reset();
    };
  }, [onScan, lang]);

  const handleCancel = async () => {
    if (streamRef.current && torchOn) {
      const track = streamRef.current.getVideoTracks()[0];
      if (track && track.readyState === 'live') {
        try {
          await track.applyConstraints({ advanced: [{ torch: false }] as any });
        } catch (err) {}
      }
    }
    onCancel();
  };

  const handleFocus = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (track && track.readyState === 'live') {
      try {
        await track.applyConstraints({
          advanced: [{ focusMode: 'single-shot' } as any]
        });
        setTimeout(async () => {
          try {
            if (track.readyState === 'live') {
              await track.applyConstraints({
                advanced: [{ focusMode: 'continuous' } as any]
              });
            }
          } catch(e) {}
        }, 1000);
      } catch (err) {
        // console.error("Failed to trigger focus", err);
      }
    }
  };

  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (track && track.readyState === 'live') {
      try {
        await track.applyConstraints({
          advanced: [{ torch: !torchOn } as any]
        });
        setTorchOn(!torchOn);
      } catch (err) {
        // console.error("Failed to toggle torch", err);
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col items-center justify-center font-sans">
      {!error && (
        <video 
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover z-0"
          autoPlay
          playsInline
          muted
          onClick={handleFocus}
        />
      )}
      
      <div className="absolute top-6 flex w-full max-w-md justify-center items-center px-6 z-10 text-white drop-shadow-md">
        <h2 className="text-2xl font-black er uppercase">
          {lang === 'ar' ? 'مسح باركود' : 'Scan Barcode'}
        </h2>
      </div>

      {error ? (
        <div className="text-white text-center p-6 border-4 border-red-500 mx-4 mt-12 z-10 bg-black/80">
          <p className="mb-6 font-bold uppercase  text-sm">{error}</p>
          <button onClick={() => window.location.reload()} className="bg-white text-slate-900 px-8 py-3 font-black uppercase  text-xs hover:bg-slate-200 rounded-2xl">
            {lang === 'ar' ? 'المحاولة مرة أخرى' : 'Try Again'}
          </button>
        </div>
      ) : (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-0">
          <div className="w-64 h-64 border-2 border-white/30 relative">
            <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-emerald-500"></div>
            <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-emerald-500"></div>
            <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-emerald-500"></div>
            <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-emerald-500"></div>
          </div>
        </div>
      )}

      <div className="absolute bottom-12 flex items-center justify-center gap-6 w-full max-w-md px-6 z-10">
        <button 
           onClick={handleCancel}
          className="p-4 border-4 border-white/40 hover:border-white transition-colors text-white rounded-full flex items-center justify-center bg-black/40 backdrop-blur-sm"
        >
          <X className="w-8 h-8" />
        </button>
        <div className="w-[88px] h-[88px]" />
        {torchSupported ? (
          <button 
             onClick={toggleTorch}
            className={`p-4 border-4 transition-colors ${torchOn ? 'border-yellow-400 text-yellow-400 bg-yellow-400/20' : 'border-white/40 hover:border-white text-white'} flex items-center justify-center rounded-full bg-black/40 backdrop-blur-sm`}
          >
            {torchOn ? <Zap className="w-8 h-8" /> : <ZapOff className="w-8 h-8" />}
          </button>
        ) : (
          <div className="w-[72px] h-[72px]" />
        )}
      </div>
    </div>
  );
}
