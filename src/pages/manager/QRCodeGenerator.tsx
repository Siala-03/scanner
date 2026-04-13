import { useState } from 'react';
import { PrinterIcon, DownloadIcon, PlusIcon, Trash2 } from 'lucide-react';
import QRCode from 'react-qr-code';
import { Button } from '../../components/ui/Button';

interface QRCodeGeneratorProps {
  tables: number[];
  onAddTable: () => Promise<void>;
  onDeleteTable?: (tableNumber: number) => Promise<void>;
  baseUrl?: string;
  restaurantId?: string;
  restaurantName?: string;
}

export function QRCodeGenerator({
  tables,
  onAddTable,
  onDeleteTable,
  baseUrl,
  restaurantId,
  restaurantName
}: QRCodeGeneratorProps) {
  const [isAddingTable, setIsAddingTable] = useState(false);

  const handleAddTable = async () => {
    try {
      console.log('Adding table...');
      setIsAddingTable(true);
      await onAddTable();
      console.log('Table added successfully');
    } catch (error) {
      console.error('Failed to add table:', error);
      // Don't show alert - we handle backend failures gracefully now
      // The table will still be added locally for QR code generation
    } finally {
      setIsAddingTable(false);
    }
  };
  const handlePrint = () => {
    window.print();
  };

  const handleDeleteTable = async (tableNum: number) => {
    if (!onDeleteTable) {
      return;
    }

    if (!confirm(`Delete QR code for table ${tableNum}? This cannot be undone.`)) {
      return;
    }

    try {
      await onDeleteTable(tableNum);
    } catch (error) {
      console.error('Failed to delete QR code:', error);
      alert('Failed to delete the QR code. Please try again.');
    }
  };

  const resolvedBaseUrl = baseUrl || window.location.origin;
  const validTables = tables.filter((tableNum) => typeof tableNum === 'number' && Number.isFinite(tableNum));
  const qrTitle = restaurantName ? `${restaurantName} QR Codes` : 'Table QR Codes';

  const handleDownload = (tableNum: number) => {
    const container = document.getElementById(`qr-container-${tableNum}`) as HTMLDivElement | null;
    if (!container) return;

    const svg = container.querySelector('svg') as SVGSVGElement | null;
    if (!svg) return;

    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(svg);
    const svgBlob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = () => {
      const width = 420;
      const height = 520;
      const qrSize = 320;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const titleText = restaurantName || 'Restaurant';
      const qrLink = restaurantId
        ? `${resolvedBaseUrl}/r/${encodeURIComponent(restaurantId)}/t/${tableNum}`
        : `${resolvedBaseUrl}/t/${tableNum}`;

      // Background
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, width, height);

      // Card background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(16, 16, width - 32, height - 32);
      ctx.strokeStyle = '#d1d5db';
      ctx.lineWidth = 2;
      ctx.strokeRect(16, 16, width - 32, height - 32);

      // Header text
      ctx.fillStyle = '#0f172a';
      ctx.font = '700 26px Inter, sans-serif';
      ctx.fillText(titleText, 34, 62);

      ctx.fillStyle = '#475569';
      ctx.font = '600 18px Inter, sans-serif';
      ctx.fillText(`Table ${tableNum}`, 34, 94);

      // QR image
      const qrX = (width - qrSize) / 2;
      const qrY = 120;
      ctx.drawImage(img, qrX, qrY, qrSize, qrSize);

      // Footer text
      ctx.fillStyle = '#0f172a';
      ctx.font = '600 16px Inter, sans-serif';
      ctx.fillText('Scan to order from this table', 34, qrY + qrSize + 32);

      ctx.fillStyle = '#64748b';
      ctx.font = '400 12px Inter, sans-serif';
      const linkText = qrLink;
      const maxWidth = width - 68;
      const linkY = qrY + qrSize + 54;
      if (ctx.measureText(linkText).width <= maxWidth) {
        ctx.fillText(linkText, 34, linkY);
      } else {
        const ellipsis = '...';
        let truncated = linkText;
        while (ctx.measureText(truncated + ellipsis).width > maxWidth && truncated.length > 0) {
          truncated = truncated.slice(0, -1);
        }
        ctx.fillText(`${truncated}${ellipsis}`, 34, linkY);
      }

      URL.revokeObjectURL(url);
      const pngUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = pngUrl;
      link.download = `${titleText.replace(/\s+/g, '_').toLowerCase()}_table-${tableNum}.png`;
      link.click();
    };
    img.src = url;
  };

  return (
    <div className="dark bg-slate-900 p-3 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 md:mb-8">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-100">{qrTitle}</h1>
            <p className="text-slate-400 text-sm">
              Generate QR codes for customers to scan and place orders from their tables.
            </p>
          </div>
          <div className="flex gap-2 sm:gap-3">
            <Button variant="secondary" size="sm" onClick={handlePrint}>
              <PrinterIcon className="w-4 h-4" />
              <span className="hidden sm:inline">Print All</span>
            </Button>
            <Button variant="primary" size="sm" onClick={handleAddTable} disabled={isAddingTable}>
              <PlusIcon className="w-4 h-4" />
              <span className="hidden sm:inline">{isAddingTable ? 'Adding...' : 'Add Table'}</span>
            </Button>
          </div>
        </div>

        {/* QR Grid */}
        {validTables.length === 0 ? (
          <p className="text-center text-slate-300 py-12 md:py-20">
            No tables created yet. Use the "Add Table" button above to generate a new table number and QR code.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
            {validTables.map((tableNum) => {
              const qrLink = restaurantId
                ? `${resolvedBaseUrl}/r/${encodeURIComponent(restaurantId)}/t/${tableNum}`
                : `${resolvedBaseUrl}/t/${tableNum}`;
              return (
                <div
                  key={tableNum}
                  className="bg-white p-3 sm:p-6 rounded-xl border border-slate-200 flex flex-col items-center justify-center text-center shadow-md hover:shadow-lg transition-shadow"
                >
                  <h2 className="text-lg sm:text-2xl font-bold text-slate-900 mb-2">
                    Table {tableNum}
                  </h2>
                  {restaurantName && (
                    <p className="text-xs sm:text-sm text-slate-500 mb-2 sm:mb-4">{restaurantName}</p>
                  )}

                  {/* QR Code */}
                  <div id={`qr-container-${tableNum}`} className="mb-3 sm:mb-4 p-1 sm:p-2 bg-white rounded">
                    <QRCode
                      value={qrLink}
                      size={140}
                      level="H"
                    />
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-2 mb-2 sm:mb-3">
                    <button
                      onClick={() => handleDownload(tableNum)}
                      className="p-2 rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-colors"
                      title="Download QR"
                    >
                      <DownloadIcon className="w-4 h-4" />
                    </button>
                    {onDeleteTable && (
                      <button
                        onClick={() => handleDeleteTable(tableNum)}
                        className="p-2 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors"
                        title="Delete QR"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <p className="text-xs sm:text-sm text-slate-500 font-medium">
                    Scan to order
                  </p>
                  <p className="text-[10px] sm:text-xs text-slate-400 mt-1 break-all font-mono hidden sm:block">
                    {qrLink}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}