import { useState } from 'react';
import { PrinterIcon, DownloadIcon, PlusIcon, Trash2, CopyIcon, CheckIcon } from 'lucide-react';
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
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

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
  const restaurantPath = restaurantId ? `${resolvedBaseUrl}/r/${encodeURIComponent(restaurantId)}` : resolvedBaseUrl;
  const tableLink = (tableNum: number) => `${restaurantPath}/t/${tableNum}`;
  const onlineLink = `${restaurantPath}/t/${ONLINE_TABLE}`;
  const reservationLink = `${restaurantPath}/t/${ONLINE_TABLE}/reserve`;
  const titleText = restaurantName || 'Restaurant';
  const filePrefix = titleText.replace(/\s+/g, '_').toLowerCase();

  const handleCopy = (key: string, link: string) => {
    navigator.clipboard.writeText(link);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 2000);
  };

  // Renders the QR inside `containerId` onto a printable card and downloads it as PNG.
  // Every QR (tables, online ordering, reservations) uses the same card layout.
  const downloadQrCard = (containerId: string, heading: string, caption: string, link: string, fileName: string) => {
    const container = document.getElementById(containerId) as HTMLDivElement | null;
    const svg = container?.querySelector('svg') as SVGSVGElement | null;
    if (!svg) return;

    const source = new XMLSerializer().serializeToString(svg);
    const url = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml;charset=utf-8' }));

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

      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(16, 16, width - 32, height - 32);
      ctx.strokeStyle = '#d1d5db';
      ctx.lineWidth = 2;
      ctx.strokeRect(16, 16, width - 32, height - 32);

      ctx.fillStyle = '#0f172a';
      ctx.font = '700 26px Inter, sans-serif';
      ctx.fillText(titleText, 34, 62);

      ctx.fillStyle = '#475569';
      ctx.font = '600 18px Inter, sans-serif';
      ctx.fillText(heading, 34, 94);

      const qrY = 120;
      ctx.drawImage(img, (width - qrSize) / 2, qrY, qrSize, qrSize);

      ctx.fillStyle = '#0f172a';
      ctx.font = '600 16px Inter, sans-serif';
      ctx.fillText(caption, 34, qrY + qrSize + 32);

      ctx.fillStyle = '#64748b';
      ctx.font = '400 12px Inter, sans-serif';
      const maxWidth = width - 68;
      let linkText = link;
      while (ctx.measureText(linkText + '...').width > maxWidth && linkText.length > 0) {
        linkText = linkText.slice(0, -1);
      }
      ctx.fillText(linkText === link ? link : `${linkText}...`, 34, qrY + qrSize + 54);

      URL.revokeObjectURL(url);
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = `${filePrefix}_${fileName}.png`;
      a.click();
    };
    img.src = url;
  };

  const validTables = tables.filter((tableNum) => typeof tableNum === 'number' && Number.isFinite(tableNum));
  const qrTitle = restaurantName ? `${restaurantName} QR Codes` : 'Table QR Codes';

  // Online ordering and reservations share the table-card look.
  const shareCards = restaurantId
    ? [
        { key: 'online', heading: 'Order Online', caption: 'Scan to order online', link: onlineLink, fileName: 'online-order-qr' },
        { key: 'reserve', heading: 'Book a Table', caption: 'Scan to book a table', link: reservationLink, fileName: 'reservation-qr' },
      ]
    : [];

  const renderCard = (opts: { key: string; heading: string; caption: string; link: string; fileName: string; onDelete?: () => void }) => (
    <div
      key={opts.key}
      className="bg-white p-3 sm:p-6 rounded-xl border border-slate-200 flex flex-col items-center justify-center text-center shadow-md hover:shadow-lg transition-shadow"
    >
      <h2 className="text-lg sm:text-2xl font-bold text-slate-900 mb-2">{opts.heading}</h2>
      {restaurantName && (
        <p className="text-xs sm:text-sm text-slate-500 mb-2 sm:mb-4">{restaurantName}</p>
      )}
      <div id={`qr-container-${opts.key}`} className="mb-3 sm:mb-4 p-1 sm:p-2 bg-white rounded">
        <QRCode value={opts.link} size={140} level="H" />
      </div>
      <div className="flex items-center gap-2 mb-2 sm:mb-3">
        <button
          onClick={() => downloadQrCard(`qr-container-${opts.key}`, opts.heading, opts.caption, opts.link, opts.fileName)}
          className="p-2 rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-colors"
          title="Download QR"
        >
          <DownloadIcon className="w-4 h-4" />
        </button>
        <button
          onClick={() => handleCopy(opts.key, opts.link)}
          className="p-2 rounded-lg bg-slate-200 text-slate-700 hover:bg-slate-300 transition-colors"
          title="Copy link"
        >
          {copiedKey === opts.key ? <CheckIcon className="w-4 h-4" /> : <CopyIcon className="w-4 h-4" />}
        </button>
        {opts.onDelete && (
          <button
            onClick={opts.onDelete}
            className="p-2 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors"
            title="Delete QR"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
      <p className="text-xs sm:text-sm text-slate-500 font-medium">{opts.caption}</p>
    </div>
  );

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

        {shareCards.length > 0 && (
          <>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400 mb-3">Share online</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6 mb-8">
              {shareCards.map((c) => renderCard(c))}
            </div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400 mb-3">Tables</h2>
          </>
        )}

        {validTables.length === 0 ? (
          <p className="text-center text-slate-300 py-12 md:py-20">
            No tables created yet. Use the "Add Table" button above to generate a new table number and QR code.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
            {validTables.map((tableNum) =>
              renderCard({
                key: String(tableNum),
                heading: `Table ${tableNum}`,
                caption: 'Scan to order from this table',
                link: tableLink(tableNum),
                fileName: `table-${tableNum}`,
                onDelete: onDeleteTable ? () => handleDeleteTable(tableNum) : undefined,
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}