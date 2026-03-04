import React from 'react';
import { motion } from 'framer-motion';
import { PrinterIcon, DownloadIcon } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
export function QRCodeGenerator() {
  const tables = Array.from(
    {
      length: 20
    },
    (_, i) => i + 1
  );
  const handlePrint = () => {
    window.print();
  };
  return (
    <div className="dark min-h-screen bg-slate-900 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header - Hidden when printing */}
        <div className="flex items-center justify-between mb-8 print:hidden">
          <div>
            <h1 className="text-2xl font-bold text-white">Table QR Codes</h1>
            <p className="text-slate-400">
              Print these codes to place on tables
            </p>
          </div>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={handlePrint}>
              <PrinterIcon className="w-4 h-4" />
              Print All
            </Button>
          </div>
        </div>

        {/* QR Grid - Optimized for printing */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 print:grid-cols-3 print:gap-8">
          {tables.map((tableNum) =>
          <Card
            key={tableNum}
            className="bg-white p-6 flex flex-col items-center justify-center text-center print:shadow-none print:border print:border-gray-200">

              <h2 className="text-2xl font-bold text-slate-900 mb-4">
                Table {tableNum}
              </h2>

              {/* Simulated QR Code (in a real app, use a library like qrcode.react) */}
              <div className="w-40 h-40 bg-white border-4 border-slate-900 p-2 mb-4 relative">
                <div className="absolute top-0 left-0 w-8 h-8 border-r-4 border-b-4 border-slate-900" />
                <div className="absolute top-0 right-0 w-8 h-8 border-l-4 border-b-4 border-slate-900" />
                <div className="absolute bottom-0 left-0 w-8 h-8 border-r-4 border-t-4 border-slate-900" />

                {/* Random pattern to look like QR */}
                <div className="w-full h-full grid grid-cols-6 gap-1 p-1">
                  {Array.from({
                  length: 36
                }).map((_, i) =>
                <div
                  key={i}
                  className={`w-full h-full ${Math.random() > 0.4 ? 'bg-slate-900' : 'bg-transparent'}`} />

                )}
                </div>
              </div>

              <p className="text-sm text-slate-500 font-medium">
                Scan to order
              </p>
              <p className="text-xs text-slate-400 mt-1">
                serv.app/t/{tableNum}
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>);

}