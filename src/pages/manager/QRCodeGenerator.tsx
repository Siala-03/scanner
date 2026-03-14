import React from 'react';
import { PrinterIcon, DownloadIcon } from 'lucide-react';
import QRCode from 'react-qr-code';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
interface QRCodeGeneratorProps {
  tables: number[];
  onAddTable: () => void;
  baseUrl?: string;
}

export function QRCodeGenerator({
  tables,
  onAddTable,
  baseUrl
}: QRCodeGeneratorProps) {
  // default to empty list if none
  const handlePrint = () => {
    window.print();
  };

  const resolvedBaseUrl =
    baseUrl ||
    (typeof window !== 'undefined' ? window.location.origin : 'https://servv.app');

  const handleDownload = (tableNum: number) => {
    const svg = document.getElementById(`qr-${tableNum}`) as SVGSVGElement | null;
    if (!svg) return;

    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(svg);
    const svgBlob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 320;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);

      const pngUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = pngUrl;
      link.download = `table-${tableNum}.png`;
      link.click();
    };
    img.src = url;
  };
  return (
    <div className="dark min-h-screen bg-slate-900 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header - Hidden when printing */}
        <div className="flex flex-col sm:flex-row items-center justify-between mb-8 print:hidden">
          <div>
            <h1 className="text-2xl font-bold text-white">Table QR Codes</h1>
            <p className="text-slate-400">
              Print or download codes to place on tables
            </p>
          </div>
          <div className="flex gap-3 mt-4 sm:mt-0">
            <Button variant="secondary" onClick={handlePrint}>
              <PrinterIcon className="w-4 h-4" />
              Print All
            </Button>
            <Button variant="primary" onClick={onAddTable}>
              <DownloadIcon className="w-4 h-4" />
              Add Table
            </Button>
          </div>
        </div>

        {/* QR Grid - Optimized for printing */}
        {tables.length === 0 ? (
          <p className="text-center text-slate-300 py-20">
            No tables created yet. Use the &quot;Add Table&quot; button above to
            generate a new table number and QR code.
          </p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 print:grid-cols-3 print:gap-8">
            {tables.map((tableNum) => (
              <Card
                key={tableNum}
                className="bg-white p-6 flex flex-col items-center justify-center text-center print:shadow-none print:border print:border-gray-200"
              >
                <h2 className="text-2xl font-bold text-slate-900 mb-4">
                  Table {tableNum}
                </h2>

                {/* Real QR Code */}
                <div className="w-40 h-40 mb-4">
                  <QRCode
                    id={`qr-${tableNum}`}
                    value={`${resolvedBaseUrl}/t/${tableNum}`}
                    size={160}
                    level="H"
                    includeMargin={true}
                  bgColor="#ecfdf3"
                  fgColor="#16a34a"
                  />
                </div>

                <div className="flex gap-2 mb-2 print:hidden">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDownload(tableNum);
                    }}
                    className="flex items-center gap-1 px-3 py-1 rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-colors"
                  >
                    <DownloadIcon className="w-4 h-4" />
                    Download
                  </button>
                </div>

                <p className="text-sm text-slate-500 font-medium">
                  Scan to order
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  {`${resolvedBaseUrl}/t/${tableNum}`}
                </p>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}