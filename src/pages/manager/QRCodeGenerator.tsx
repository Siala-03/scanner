import { useState } from 'react';
import { PrinterIcon, DownloadIcon, PlusIcon, Trash2, GlobeIcon, CalendarIcon, CopyIcon, CheckIcon } from 'lucide-react';
import QRCode from 'react-qr-code';
import { Button } from '../../components/ui/Button';

const ONLINE_TABLE = 999;

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
  const [reservationLinkCopied, setReservationLinkCopied] = useState(false);

  const handleAddTable = async () => {
    try {
      setIsAddingTable(true);
      await onAddTable();
    } catch (error) {
      console.error('Failed to add table:', error);
      alert('Failed to save table to the database. Please try again.');
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

  const handleDownloadOnlineQR = () => {
    if (!restaurantId) return;
    const onlineLink = `${resolvedBaseUrl}/r/${encodeURIComponent(restaurantId)}/t/${ONLINE_TABLE}`;
    const container = document.getElementById('qr-container-online') as HTMLDivElement | null;
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
      const height = 560;
      const qrSize = 300;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.fillStyle = '#f0fdf4';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(16, 16, width - 32, height - 32);
      ctx.strokeStyle = '#16a34a';
      ctx.lineWidth = 2;
      ctx.strokeRect(16, 16, width - 32, height - 32);

      ctx.fillStyle = '#15803d';
      ctx.font = '700 22px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Order Online', width / 2, 56);

      ctx.fillStyle = '#166534';
      ctx.font = '600 15px Inter, sans-serif';
      ctx.fillText(restaurantName || 'Restaurant', width / 2, 80);

      const qrX = (width - qrSize) / 2;
      const qrY = 100;
      ctx.drawImage(img, qrX, qrY, qrSize, qrSize);

      ctx.fillStyle = '#15803d';
      ctx.font = '600 13px Inter, sans-serif';
      ctx.fillText('Scan to browse menu & place your order', width / 2, qrY + qrSize + 28);

      ctx.fillStyle = '#16a34a';
      ctx.font = '500 11px monospace';
      const maxW = width - 68;
      let linkText = onlineLink;
      while (ctx.measureText(linkText).width > maxW && linkText.length > 0) {
        linkText = linkText.slice(0, -1);
      }
      if (linkText !== onlineLink) linkText += '…';
      ctx.fillText(linkText, width / 2, qrY + qrSize + 50);

      URL.revokeObjectURL(url);
      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = `${(restaurantName || 'restaurant').replace(/\s+/g, '_').toLowerCase()}_online-order-qr.png`;
      link.click();
    };
    img.src = url;
  };
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

      const titleText = restaurantName || 'Company';
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

        {/* Online Ordering QR — Table 999 */}
        {restaurantId && (
          <div className="mb-6 p-4 rounded-xl border-2 border-green-500/40 bg-green-500/10">
            <div className="flex flex-col sm:flex-row items-center gap-6">
              <div id="qr-container-online" className="p-3 bg-white rounded-lg border border-green-200 flex-shrink-0">
                <QRCode
                  value={`${resolvedBaseUrl}/r/${encodeURIComponent(restaurantId)}/t/${ONLINE_TABLE}`}
                  size={160}
                  level="H"
                />
              </div>
              <div className="flex-1 text-center sm:text-left">
                <div className="flex items-center justify-center sm:justify-start gap-2 mb-1">
                  <GlobeIcon className="w-5 h-5 text-green-400" />
                  <h2 className="text-lg font-bold text-green-300">Online Ordering QR</h2>
                  <span className="px-2 py-0.5 text-xs font-semibold rounded bg-green-500/20 text-green-300 border border-green-500/30">
                    Table {ONLINE_TABLE}
                  </span>
                </div>
                <p className="text-slate-400 text-sm mb-3">
                  Share this QR code on social media or your website. Customers scan it to browse your menu and place orders online.
                </p>
                <div className="mb-4 px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 font-mono text-xs text-green-300 break-all select-all">
                  {`${resolvedBaseUrl}/r/${encodeURIComponent(restaurantId)}/t/${ONLINE_TABLE}`}
                </div>
                <button
                  onClick={handleDownloadOnlineQR}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white text-sm font-medium transition-colors"
                >
                  <DownloadIcon className="w-4 h-4" />
                  Download Online QR
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Reservation Link */}
        {restaurantId && (
          <div className="mb-6 p-4 rounded-xl border-2 border-indigo-500/40 bg-indigo-500/10">
            <div className="flex flex-col sm:flex-row items-center gap-6">
              <div className="p-3 bg-white rounded-lg border border-indigo-200 flex-shrink-0">
                <QRCode
                  value={`${resolvedBaseUrl}/r/${encodeURIComponent(restaurantId)}/t/${ONLINE_TABLE}/reserve`}
                  size={160}
                  level="H"
                />
              </div>
              <div className="flex-1 text-center sm:text-left">
                <div className="flex items-center justify-center sm:justify-start gap-2 mb-1">
                  <CalendarIcon className="w-5 h-5 text-indigo-400" />
                  <h2 className="text-lg font-bold text-indigo-300">Reservation Link</h2>
                </div>
                <p className="text-slate-400 text-sm mb-3">
                  Share this link or QR code so customers can book a table directly. Opens the reservation form instantly.
                </p>
                <div className="flex items-center gap-2 mb-4">
                  <div className="flex-1 px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 font-mono text-xs text-indigo-300 break-all select-all">
                    {`${resolvedBaseUrl}/r/${encodeURIComponent(restaurantId)}/t/${ONLINE_TABLE}/reserve`}
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`${resolvedBaseUrl}/r/${encodeURIComponent(restaurantId)}/t/${ONLINE_TABLE}/reserve`);
                      setReservationLinkCopied(true);
                      setTimeout(() => setReservationLinkCopied(false), 2000);
                    }}
                    className="p-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors flex-shrink-0"
                    title="Copy link"
                  >
                    {reservationLinkCopied ? <CheckIcon className="w-4 h-4" /> : <CopyIcon className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-xs text-slate-500">
                  Short form also works: <span className="font-mono text-indigo-400">{resolvedBaseUrl}/t/{ONLINE_TABLE}/reservation</span>
                </p>
              </div>
            </div>
          </div>
        )}

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