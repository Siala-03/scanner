import { useState } from 'react';
import { PrinterIcon, DownloadIcon, PlusIcon } from 'lucide-react';
import QRCode from 'react-qr-code';
import { Button } from '../../components/ui/Button';

interface QRCodeGeneratorProps {
  tables: number[];
  onAddTable: () => Promise<void>;
  baseUrl?: string;
  restaurantName?: string;
}

export function QRCodeGenerator({
  tables,
  onAddTable,
  baseUrl,
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
    <div className="dark bg-slate-900 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-100">{qrTitle}</h1>
            <p className="text-slate-400">
              Generate QR codes for customers to scan and place orders from their tables.
            </p>
          </div>
          <div className="flex gap-3 mt-4 sm:mt-0">
            <Button variant="secondary" onClick={handlePrint}>
              <PrinterIcon className="w-4 h-4" />
              Print All
            </Button>
            <Button variant="primary" onClick={handleAddTable} disabled={isAddingTable}>
              <PlusIcon className="w-4 h-4" />
              {isAddingTable ? 'Adding...' : 'Add Table'}
            </Button>
          </div>
        </div>

        {/* QR Grid */}
        {validTables.length === 0 ? (
          <p className="text-center text-slate-300 py-20">
            No tables created yet. Use the "Add Table" button above to generate a new table number and QR code.
          </p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {validTables.map((tableNum) => {
              const qrLink = `${resolvedBaseUrl}/t/${tableNum}`;
              return (
                <div
                  key={tableNum}
                  className="bg-white p-6 rounded-xl border border-slate-200 flex flex-col items-center justify-center text-center shadow-md hover:shadow-lg transition-shadow"
                >
                  <h2 className="text-2xl font-bold text-slate-900 mb-2">
                    Table {tableNum}
                  </h2>
                  {restaurantName && (
                    <p className="text-sm text-slate-500 mb-4">{restaurantName}</p>
                  )}

                  {/* QR Code */}
                  <div id={`qr-container-${tableNum}`} className="mb-4 p-2 bg-white rounded">
                    <QRCode
                      value={qrLink}
                      size={160}
                      level="H"
                      includeMargin={true}
                    />
                  </div>

                  {/* Download Button */}
                  <button
                    onClick={() => handleDownload(tableNum)}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-colors mb-3"
                  >
                    <DownloadIcon className="w-4 h-4" />
                    Download
                  </button>

                  <p className="text-sm text-slate-500 font-medium">
                    Customers scan to order
                  </p>
                  <p className="text-xs text-slate-400 mt-1 break-all font-mono">
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