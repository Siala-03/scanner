import { PrinterIcon, DownloadIcon } from 'lucide-react';
import QRCode from 'react-qr-code';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
interface QRCodeGeneratorProps {
  tables: number[];
  onAddTable: () => void;
  baseUrl?: string;
  restaurantName?: string;
}

export function QRCodeGenerator({
  tables,
  onAddTable,
  baseUrl,
  restaurantName
}: QRCodeGeneratorProps) {
  // default to empty list if none
  const handlePrint = () => {
    window.print();
  };

  const resolvedBaseUrl = baseUrl || window.location.origin;
  const validTables = tables.filter((tableNum) => typeof tableNum === 'number' && Number.isFinite(tableNum));
  const qrTitle = restaurantName ? `${restaurantName} QR Codes` : 'Table QR Codes';

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
        <div className="flex flex-col sm:flex-row items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-100">{qrTitle}</h1>
            <p className="text-slate-400">
              Print or download table-specific codes for your restaurant.
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
        {validTables.length === 0 ? (
          <p className="text-center text-slate-300 py-20">
            No tables created yet. Use the "Add Table" button above to generate a new table number and QR code.
          </p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {validTables.map((tableNum) => {
              const qrLink = `${resolvedBaseUrl}/t/${tableNum}`;
              return (
                <div key={tableNum}>
                  Table {tableNum}
                  <QRCode value={qrLink} size={160} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}