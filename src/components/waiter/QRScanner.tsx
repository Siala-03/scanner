import { useState, useRef, useEffect } from 'react';
import { CameraIcon, XIcon, FlashlightIcon, RotateCwIcon } from 'lucide-react';
import jsQR from 'jsqr';

interface QRScannerProps {
  onScan: (tableNumber: number) => void;
  onClose: () => void;
  onError?: (error: string) => void;
}

export function QRScanner({ onScan, onClose, onError }: QRScannerProps) {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [flashEnabled, setFlashEnabled] = useState(false);
  const [scanRegion, setScanRegion] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number>();

  // Initialize camera
  useEffect(() => {
    let mounted = true;

    const startCamera = async () => {
      try {
        // Stop existing stream
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
        }

        const constraints = {
          video: {
            facingMode: facingMode,
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        
        if (!mounted) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }

        streamRef.current = stream;
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setHasPermission(true);
          
          // Calculate scan region after video loads
          videoRef.current.onloadedmetadata = () => {
            if (videoRef.current && mounted) {
              const video = videoRef.current;
              const rect = video.getBoundingClientRect();
              setScanRegion({
                x: rect.left,
                y: rect.top,
                width: rect.width,
                height: rect.height
              });
              
              // Start scanning
              startScanning();
            }
          };
        }
      } catch (err) {
        console.error('Camera access error:', err);
        if (mounted) {
          setHasPermission(false);
          onError?.('Camera access denied. Please enable camera permissions.');
        }
      }
    };

    startCamera();

    return () => {
      mounted = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [facingMode, onError]);

  // QR Code scanning logic
  const startScanning = () => {
    const scanFrame = () => {
      if (!videoRef.current || !canvasRef.current) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');

      if (!ctx || video.readyState !== video.HAVE_ENOUGH_DATA) {
        animationFrameRef.current = requestAnimationFrame(scanFrame);
        return;
      }

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Get image data for QR processing
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      
      // Try to decode QR code
      // Note: In a real implementation, you'd use a QR decoding library like jsQR
      // For now, we'll simulate with a mock implementation
      const qrData = decodeQRFromImageData(imageData);
      
      if (qrData) {
        handleQRData(qrData);
      } else {
        animationFrameRef.current = requestAnimationFrame(scanFrame);
      }
    };

    animationFrameRef.current = requestAnimationFrame(scanFrame);
  };

  // QR decoding function using jsQR library
  const decodeQRFromImageData = (imageData: ImageData): string | null => {
    const qrCode = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'dontInvert',
    });
    
    return qrCode ? qrCode.data : null;
  };

  // Handle scanned QR data
  const handleQRData = (data: string) => {
    try {
      let tableNumber: number | null = null;

      // Support full deep-link URLs like https://example.com/t/12
      const urlMatch = data.match(/\/t\/(\d+)/);
      if (urlMatch) {
        tableNumber = parseInt(urlMatch[1], 10);
      } else if (data.startsWith('TABLE:')) {
        tableNumber = parseInt(data.substring(6), 10);
      } else {
        tableNumber = parseInt(data, 10);
      }

      if (tableNumber !== null && !isNaN(tableNumber) && tableNumber > 0) {
        onScan(tableNumber);
      } else {
        onError?.('Invalid QR code. Please scan a table QR code.');
      }
    } catch (err) {
      onError?.('Failed to parse QR code.');
    }
  };

  // Toggle flash
  const toggleFlash = () => {
    if (streamRef.current) {
      const track = streamRef.current.getVideoTracks()[0];
      if (track) {
        const capabilities = track.getCapabilities() as any;
        if (capabilities.torch) {
          track.applyConstraints({
            advanced: [{ torch: !flashEnabled }]
          } as any);
          setFlashEnabled(!flashEnabled);
        }
      }
    }
  };

  // Switch camera
  const switchCamera = () => {
    setFacingMode(prev => prev === 'environment' ? 'user' : 'environment');
  };

  // Manual table entry (fallback)
  const handleManualEntry = () => {
    const tableNum = prompt('Enter table number:');
    if (tableNum) {
      const num = parseInt(tableNum);
      if (!isNaN(num) && num > 0) {
        onScan(num);
      } else {
        onError?.('Please enter a valid table number.');
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-4 bg-gradient-to-b from-black/70 to-transparent">
        <button
          onClick={onClose}
          className="p-2 rounded-full bg-white/20 text-white hover:bg-white/30 transition-colors"
        >
          <XIcon className="w-6 h-6" />
        </button>
        <div className="text-white font-semibold">Scan Table QR Code</div>
        <button
          onClick={handleManualEntry}
          className="px-4 py-2 rounded-full bg-amber-500 text-white font-medium hover:bg-amber-600 transition-colors"
        >
          Manual Entry
        </button>
      </div>

      {/* Camera View */}
      <div className="flex-1 relative flex items-center justify-center">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover"
        />
        <canvas ref={canvasRef} className="hidden" />

        {/* Scan Overlay */}
        <div className="relative z-10 w-64 h-64 border-2 border-white/50 rounded-lg">
          {/* Corner markers */}
          <div className="absolute -top-1 -left-1 w-8 h-8 border-t-4 border-l-4 border-amber-500 rounded-tl-lg" />
          <div className="absolute -top-1 -right-1 w-8 h-8 border-t-4 border-r-4 border-amber-500 rounded-tr-lg" />
          <div className="absolute -bottom-1 -left-1 w-8 h-8 border-b-4 border-l-4 border-amber-500 rounded-bl-lg" />
          <div className="absolute -bottom-1 -right-1 w-8 h-8 border-b-4 border-r-4 border-amber-500 rounded-br-lg" />
          
          {/* Scan line animation */}
          <div className="absolute inset-x-0 top-0 h-0.5 bg-amber-500/80 animate-scan" />
        </div>

        {/* Instructions */}
        <div className="absolute bottom-32 left-0 right-0 text-center text-white/90 px-4">
          <p className="text-lg font-medium mb-2">Position QR code in frame</p>
          <p className="text-sm text-white/70">Camera will automatically scan</p>
        </div>

        {/* Permission denied message */}
        {hasPermission === false && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-20">
            <div className="text-center p-6">
              <CameraIcon className="w-16 h-16 text-white/50 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-white mb-2">Camera Access Denied</h3>
              <p className="text-white/70 mb-4">Please enable camera permissions in your browser settings.</p>
              <button
                onClick={handleManualEntry}
                className="px-6 py-3 rounded-full bg-amber-500 text-white font-medium hover:bg-amber-600 transition-colors"
              >
                Enter Table Manually
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="absolute bottom-8 left-0 right-0 flex items-center justify-center gap-6 z-10">
        <button
          onClick={toggleFlash}
          className={`p-4 rounded-full ${flashEnabled ? 'bg-amber-500' : 'bg-white/20'} text-white transition-colors`}
        >
          <FlashlightIcon className="w-6 h-6" />
        </button>
        <button
          onClick={switchCamera}
          className="p-4 rounded-full bg-white/20 text-white hover:bg-white/30 transition-colors"
        >
          <RotateCwIcon className="w-6 h-6" />
        </button>
      </div>

      <style>{`
        @keyframes scan {
          0% { top: 0; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
        .animate-scan {
          animation: scan 2s linear infinite;
        }
      `}</style>
    </div>
  );
}