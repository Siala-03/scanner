import { useState } from 'react';
import { Expense } from '../../types/expenses';
import { Download } from 'lucide-react';

interface ReceiptGeneratorProps {
  expense: Expense;
  restaurantName?: string;
  restaurantAddress?: string;
  restaurantPhone?: string;
  onClose: () => void;
}

export default function ReceiptGenerator({
  expense,
  restaurantName = 'Restaurant Name',
  restaurantAddress = '123 Main St',
  restaurantPhone = '(555) 123-4567',
  onClose,
}: ReceiptGeneratorProps) {
  const [loading, setLoading] = useState(false);

  const calculateTotal = () => {
    const subtotal = expense.amount;
    const taxAmount = expense.taxAmount || (subtotal * expense.taxRate) / 100;
    return subtotal + taxAmount;
  };

  const handleDownloadPDF = () => {
    setLoading(true);
    try {
      // Create a new window with the receipt content
      const printWindow = window.open('', '', 'width=600,height=800');
      if (printWindow) {
        printWindow.document.write(`
          <html>
            <head>
              <title>Receipt - ${expense.id}</title>
              <style>
                body {
                  font-family: Arial, sans-serif;
                  margin: 0;
                  padding: 20px;
                  background-color: #f5f5f5;
                }
                .receipt {
                  background-color: white;
                  padding: 30px;
                  border-radius: 8px;
                  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                  max-width: 600px;
                  margin: 0 auto;
                }
                .header {
                  text-align: center;
                  border-bottom: 2px solid #333;
                  padding-bottom: 20px;
                  margin-bottom: 20px;
                }
                .restaurant-name {
                  font-size: 24px;
                  font-weight: bold;
                  margin-bottom: 10px;
                }
                .receipt-title {
                  font-size: 18px;
                  font-weight: bold;
                  margin: 20px 0;
                }
                .info-section {
                  margin-bottom: 20px;
                }
                .info-row {
                  display: flex;
                  justify-content: space-between;
                  padding: 8px 0;
                  border-bottom: 1px solid #eee;
                }
                .info-label {
                  font-weight: bold;
                  color: #666;
                }
                .info-value {
                  text-align: right;
                }
                .total-section {
                  border-top: 2px solid #333;
                  border-bottom: 2px solid #333;
                  padding: 15px 0;
                  margin: 20px 0;
                }
                .total-row {
                  display: flex;
                  justify-content: space-between;
                  padding: 8px 0;
                  font-size: 16px;
                }
                .total-amount {
                  font-size: 20px;
                  font-weight: bold;
                  color: #00a8e8;
                }
                .footer {
                  text-align: center;
                  margin-top: 30px;
                  border-top: 1px solid #eee;
                  padding-top: 20px;
                  font-size: 12px;
                  color: #666;
                }
                .status-badge {
                  display: inline-block;
                  padding: 8px 12px;
                  border-radius: 4px;
                  font-size: 12px;
                  font-weight: bold;
                  margin-top: 10px;
                }
                .status-approved {
                  background-color: #d4edda;
                  color: #155724;
                }
                .status-pending {
                  background-color: #fff3cd;
                  color: #856404;
                }
              </style>
            </head>
            <body>
              <div class="receipt">
                <div class="header">
                  <div class="restaurant-name">${restaurantName}</div>
                  <div>${restaurantAddress}</div>
                  <div>${restaurantPhone}</div>
                </div>

                <div class="receipt-title">EXPENSE RECEIPT</div>

                <div class="info-section">
                  <div class="info-row">
                    <span class="info-label">Receipt #:</span>
                    <span class="info-value">${expense.referenceNumber || expense.id}</span>
                  </div>
                  <div class="info-row">
                    <span class="info-label">Date:</span>
                    <span class="info-value">${new Date(expense.expenseDate).toLocaleDateString()}</span>
                  </div>
                  <div class="info-row">
                    <span class="info-label">Category:</span>
                    <span class="info-value">${expense.category?.name || 'N/A'}</span>
                  </div>
                  <div class="info-row">
                    <span class="info-label">Vendor:</span>
                    <span class="info-value">${expense.vendorName || 'N/A'}</span>
                  </div>
                </div>

                <div class="info-section">
                  <div class="info-row">
                    <span class="info-label">Description:</span>
                  </div>
                  <div style="padding: 10px 0; color: #333;">
                    ${expense.description}
                  </div>
                </div>

                <div class="total-section">
                  <div class="total-row">
                    <span>Subtotal:</span>
                    <span>${expense.currency} ${Number(expense.amount).toFixed(2)}</span>
                  </div>
                  ${
                    expense.taxRate > 0 || expense.taxAmount > 0
                      ? `
                    <div class="total-row">
                      <span>Tax (${expense.taxRate}%):</span>
                      <span>${expense.currency} ${Number(expense.taxAmount || (expense.amount * expense.taxRate) / 100).toFixed(2)}</span>
                    </div>
                  `
                      : ''
                  }
                  <div class="total-row total-amount">
                    <span>TOTAL:</span>
                    <span>${expense.currency} ${Number(calculateTotal()).toFixed(2)}</span>
                  </div>
                </div>

                <div class="info-section">
                  <div class="info-row">
                    <span class="info-label">Payment Method:</span>
                    <span class="info-value">${(expense.paymentMethod || 'cash').replace(/_/g, ' ').toUpperCase()}</span>
                  </div>
                  <div class="info-row">
                    <span class="info-label">Payment Status:</span>
                    <span class="info-value" style="text-transform: uppercase;">${expense.paymentStatus}</span>
                  </div>
                </div>

                ${
                  expense.notes
                    ? `
                  <div class="info-section">
                    <div class="info-label" style="margin-bottom: 10px;">Notes:</div>
                    <div style="padding: 10px; background-color: #f9f9f9; border-radius: 4px;">
                      ${expense.notes}
                    </div>
                  </div>
                `
                    : ''
                }

                <div style="text-align: center; margin-top: 20px;">
                  <span class="status-badge status-${expense.approvalStatus}">
                    ${expense.approvalStatus.replace(/_/g, ' ').toUpperCase()}
                  </span>
                </div>

                <div class="footer">
                  <p>Thank you for your business!</p>
                  <p>Generated on: ${new Date().toLocaleString()}</p>
                </div>
              </div>
              <script>
                window.print();
              </script>
            </body>
          </html>
        `);
        printWindow.document.close();
      }
    } catch (error) {
      console.error('Error generating receipt:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full p-6">
        {/* Receipt Preview */}
        <div className="mb-6 bg-gray-50 p-6 rounded-lg border border-gray-200 max-h-96 overflow-y-auto">
          <div className="text-center border-b-2 pb-4 mb-4">
            <h2 className="text-2xl font-bold">{restaurantName}</h2>
            <p className="text-sm text-gray-600">{restaurantAddress}</p>
            <p className="text-sm text-gray-600">{restaurantPhone}</p>
          </div>

          <h3 className="text-lg font-bold text-center mb-4">EXPENSE RECEIPT</h3>

          <div className="space-y-3 text-sm mb-4">
            <div className="flex justify-between">
              <span className="font-medium">Receipt #:</span>
              <span>{expense.referenceNumber || expense.id}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-medium">Date:</span>
              <span>{new Date(expense.expenseDate).toLocaleDateString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-medium">Category:</span>
              <span>{expense.category?.name || 'N/A'}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-medium">Vendor:</span>
              <span>{expense.vendorName || 'N/A'}</span>
            </div>
          </div>

          <div className="border-y-2 py-4 my-4">
            <div className="text-sm mb-2">
              <span className="font-medium">Description:</span>
              <p className="mt-1">{expense.description}</p>
            </div>
          </div>

          <div className="border-t-2 border-b-2 py-4 my-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span>Subtotal:</span>
              <span>
                {expense.currency} {Number(expense.amount).toFixed(2)}
              </span>
            </div>
            {(expense.taxRate > 0 || expense.taxAmount > 0) && (
              <div className="flex justify-between text-sm">
                <span>Tax ({expense.taxRate}%):</span>
                <span>
                  {expense.currency}{' '}
                  {Number(
                    expense.taxAmount ||
                    (expense.amount * expense.taxRate) / 100
                  ).toFixed(2)}
                </span>
              </div>
            )}
            <div className="flex justify-between font-bold text-lg text-blue-600">
              <span>TOTAL:</span>
              <span>
                {expense.currency} {Number(calculateTotal()).toFixed(2)}
              </span>
            </div>
          </div>

          <div className="space-y-2 text-sm my-4">
            <div className="flex justify-between">
              <span className="font-medium">Payment Method:</span>
              <span>
                {(expense.paymentMethod || 'cash')
                  .replace(/_/g, ' ')
                  .toUpperCase()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="font-medium">Payment Status:</span>
              <span className="text-gray-600">
                {expense.paymentStatus.toUpperCase()}
              </span>
            </div>
          </div>

          {expense.notes && (
            <div className="text-sm mb-4 bg-white p-3 rounded border border-gray-200">
              <span className="font-medium">Notes:</span>
              <p className="mt-1">{expense.notes}</p>
            </div>
          )}

          <div className="text-center text-xs text-gray-600 border-t pt-4">
            <p>Generated on: {new Date().toLocaleString()}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={handleDownloadPDF}
            disabled={loading}
            className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Download size={18} />
            Print/Download
          </button>
          <button
            onClick={onClose}
            className="flex-1 bg-gray-300 text-gray-800 px-4 py-2 rounded-lg hover:bg-gray-400"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
