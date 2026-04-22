import { useState, useEffect, useMemo } from 'react';
import { RefreshCwIcon, DownloadIcon, CopyIcon, CheckIcon, QrCodeIcon, AlertCircleIcon, ShoppingBagIcon } from 'lucide-react';
import QRCode from 'react-qr-code';
import { Button } from '../../components/ui/Button';
import { getOrCreateOnlineQRCode, regenerateOnlineQRCode } from '../../api/onlineOrders';
import { OnlineQRCode, Order } from '../../types';
import { formatDate } from '../../utils/dateUtils';
import { formatPrice } from '../../utils/currency';

interface OnlineOrderingQRManagerProps {
  restaurantId: string;
  restaurantName?: string;
  orders?: Order[];
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  verified: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  preparing: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  ready: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  served: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};

export function OnlineOrderingQRManager({ restaurantId, restaurantName, orders = [] }: OnlineOrderingQRManagerProps) {
  const [qrCode, setQrCode] = useState<OnlineQRCode | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const onlineOrders = useMemo(
    () => orders.filter((o) => o.isOnlineOrder).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    ),
    [orders]
  );

  const filteredOrders = useMemo(
    () => statusFilter === 'all' ? onlineOrders : onlineOrders.filter((o) => o.status === statusFilter),
    [onlineOrders, statusFilter]
  );

  useEffect(() => {
    loadQRCode();
  }, [restaurantId]);

  const loadQRCode = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const code = await getOrCreateOnlineQRCode(restaurantId);
      setQrCode(code);
    } catch (err) {
      console.error('Failed to load QR code:', err);
      setError('Failed to load QR code. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegenerate = async () => {
    if (!confirm(
      'Regenerate QR code? The old code will no longer work. This is useful if you suspect the code has been compromised.'
    )) {
      return;
    }

    try {
      setIsRegenerating(true);
      setError(null);
      const newCode = await regenerateOnlineQRCode(restaurantId);
      setQrCode(newCode);
    } catch (err) {
      console.error('Failed to regenerate QR code:', err);
      setError('Failed to regenerate QR code. Please try again.');
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleCopyLink = () => {
    if (qrCode?.shortLink) {
      navigator.clipboard.writeText(qrCode.shortLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownloadQR = () => {
    if (!qrCode) return;

    const container = document.getElementById('qr-container') as HTMLDivElement | null;
    if (!container) return;

    const svg = container.querySelector('svg') as SVGSVGElement | null;
    if (!svg) return;

    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(svg);
    const svgBlob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = () => {
      const width = 500;
      const height = 650;
      const qrSize = 400;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);

      // Title
      ctx.fillStyle = '#1f2937';
      ctx.font = 'bold 24px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('Order Online', width / 2, 40);

      // Subtitle
      ctx.fillStyle = '#6b7280';
      ctx.font = '16px Arial';
      ctx.fillText(restaurantName || 'Restaurant', width / 2, 70);

      // QR Code
      ctx.drawImage(img, (width - qrSize) / 2, 100, qrSize, qrSize);

      // Link text
      ctx.fillStyle = '#1f2937';
      ctx.font = 'bold 14px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('or visit:', width / 2, 530);

      ctx.fillStyle = '#3b82f6';
      ctx.font = '12px Arial';
      const linkText = qrCode?.shortLink || '';
      ctx.fillText(linkText, width / 2, 560);

      // Footer
      ctx.fillStyle = '#9ca3af';
      ctx.font = '10px Arial';
      ctx.fillText('Share on social media or display in-store', width / 2, 630);

      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = `${restaurantName || 'restaurant'}-online-order-qr.png`;
      link.click();
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  if (isLoading) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-6 bg-white dark:bg-slate-800">
        <div className="flex items-center justify-center py-12">
          <div className="text-slate-500">Loading QR code...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 dark:border-red-900 p-6 bg-red-50 dark:bg-red-900/10">
        <div className="flex items-start gap-3">
          <AlertCircleIcon className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-red-900 dark:text-red-200">Error Loading QR Code</h3>
            <p className="text-sm text-red-700 dark:text-red-300 mt-1">{error}</p>
            <Button onClick={loadQRCode} variant="secondary" className="mt-3">
              Try Again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!qrCode) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* QR Code Display Card */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-8 bg-white dark:bg-slate-800">
        <div className="flex items-center gap-2 mb-6">
          <QrCodeIcon className="w-5 h-5 text-blue-600" />
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Online Ordering QR Code</h3>
        </div>

        <div className="flex flex-col md:flex-row gap-8">
          {/* QR Code */}
          <div className="flex flex-col items-center justify-center">
            <div
              id="qr-container"
              className="p-6 bg-white rounded-lg border border-slate-200 dark:border-slate-600"
            >
              <QRCode
                value={qrCode.shortLink}
                size={256}
                level="H"
                includeMargin={true}
              />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-4 text-center max-w-xs">
              Scan this code or visit the link below to order online
            </p>
          </div>

          {/* Information & Actions */}
          <div className="flex flex-col justify-between flex-1">
            <div className="space-y-4">
              {/* Short Link */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Short Link
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={qrCode.shortLink}
                    readOnly
                    className="flex-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-slate-100 text-sm font-mono"
                  />
                  <Button
                    onClick={handleCopyLink}
                    variant="secondary"
                    className="px-4"
                  >
                    {copied ? <CheckIcon className="w-4 h-4" /> : <CopyIcon className="w-4 h-4" />}
                  </Button>
                </div>
              </div>

              {/* Code Token */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Code Token
                </label>
                <input
                  type="text"
                  value={qrCode.codeToken}
                  readOnly
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-slate-100 text-sm font-mono"
                />
              </div>

              {/* Created Date */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Created
                </label>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  {formatDate(qrCode.createdAt)}
                </p>
              </div>

              {qrCode.regeneratedAt && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Last Regenerated
                  </label>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {formatDate(qrCode.regeneratedAt)}
                  </p>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col gap-2 mt-4">
              <Button onClick={handleDownloadQR} variant="primary" className="w-full">
                <DownloadIcon className="w-4 h-4 mr-2" />
                Download QR Code
              </Button>
              <Button
                onClick={handleRegenerate}
                disabled={isRegenerating}
                variant="secondary"
                className="w-full"
              >
                <RefreshCwIcon className={`w-4 h-4 mr-2 ${isRegenerating ? 'animate-spin' : ''}`} />
                {isRegenerating ? 'Regenerating...' : 'Regenerate Code'}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Usage Instructions */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-6 bg-slate-50 dark:bg-slate-700/50">
        <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-3">How to Use</h4>
        <ul className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
          <li>✓ Download the QR code and print it or display it in-store</li>
          <li>✓ Share the short link on social media (Instagram, Facebook, WhatsApp)</li>
          <li>✓ Customers scan the QR code or click the link to place orders</li>
          <li>✓ Online orders appear in your Supervisor and Waiter dashboards</li>
          <li>✓ Regenerate the code if you suspect misuse</li>
        </ul>
      </div>

      {/* Online Orders Table */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <ShoppingBagIcon className="w-5 h-5 text-blue-600" />
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Online Orders</h3>
            <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
              {onlineOrders.length} total
            </span>
          </div>
          <div className="flex gap-1 overflow-x-auto">
            {['all', 'pending', 'verified', 'preparing', 'ready', 'served', 'cancelled'].map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1 rounded text-xs font-medium whitespace-nowrap transition-colors ${
                  statusFilter === s
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                }`}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {filteredOrders.length === 0 ? (
          <div className="text-center py-12 text-slate-500 dark:text-slate-400">
            <ShoppingBagIcon className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium">No online orders yet</p>
            <p className="text-sm mt-1">Share your QR code to start receiving orders</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-700/50 text-xs uppercase text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3 text-left">Order #</th>
                  <th className="px-4 py-3 text-left">Customer</th>
                  <th className="px-4 py-3 text-left">Phone</th>
                  <th className="px-4 py-3 text-left">Items</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {filteredOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                    <td className="px-4 py-3 font-mono font-medium text-slate-900 dark:text-slate-100">
                      {order.orderNumber}
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                      {order.customerName || '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                      {order.customerPhone || '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                      {order.items?.length ?? 0} item{order.items?.length !== 1 ? 's' : ''}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900 dark:text-slate-100">
                      {formatPrice(order.total || 0)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[order.status || 'pending']}`}>
                        {order.status?.charAt(0).toUpperCase() + (order.status?.slice(1) || '')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {order.createdAt
                        ? new Date(order.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
