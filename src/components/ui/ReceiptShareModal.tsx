import React, { useState } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { Input } from './Input';
import { MessageSquare, Mail, Smartphone, Copy, Download, X } from 'lucide-react';
import { ReceiptData } from '../../utils/receipt';
import {
  sendReceiptViaWhatsApp,
  sendReceiptViaEmail,
  sendReceiptViaSMS,
  copyReceiptToClipboard,
  downloadReceiptAsFile
} from '../../api/receipt';

interface ReceiptShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  receipt: ReceiptData;
  customerPhone?: string;
  customerEmail?: string;
}

type ShareMethod = 'whatsapp' | 'email' | 'sms' | null;

export function ReceiptShareModal({
  isOpen,
  onClose,
  receipt,
  customerPhone,
  customerEmail
}: ReceiptShareModalProps) {
  const [selectedMethod, setSelectedMethod] = useState<ShareMethod>(null);
  const [phoneNumber, setPhoneNumber] = useState(customerPhone || '');
  const [email, setEmail] = useState(customerEmail || '');
  const [customMessage, setCustomMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleShare = async (method: ShareMethod) => {
    if (!method) return;
    
    setIsSending(true);
    setSuccess(false);

    try {
      switch (method) {
        case 'whatsapp':
          if (!phoneNumber) {
            alert('Please enter a phone number');
            setIsSending(false);
            return;
          }
          sendReceiptViaWhatsApp({
            phoneNumber,
            receipt,
            message: customMessage || undefined
          });
          break;

        case 'email':
          if (!email) {
            alert('Please enter an email address');
            setIsSending(false);
            return;
          }
          sendReceiptViaEmail({
            email,
            receipt,
            message: customMessage || undefined
          });
          break;

        case 'sms':
          if (!phoneNumber) {
            alert('Please enter a phone number');
            setIsSending(false);
            return;
          }
          sendReceiptViaSMS({
            phoneNumber,
            receipt,
            message: customMessage || undefined
          });
          break;

        default:
          break;
      }

      setSuccess(true);
      setTimeout(() => {
        handleClose();
      }, 1500);
    } catch (error) {
      console.error('Error sending receipt:', error);
      alert('Failed to send receipt. Please try again.');
    } finally {
      setIsSending(false);
    }
  };

  const handleCopy = async () => {
    try {
      await copyReceiptToClipboard(receipt);
      setSuccess(true);
      setTimeout(() => {
        handleClose();
      }, 1500);
    } catch (error) {
      alert('Failed to copy receipt. Please try again.');
    }
  };

  const handleDownload = () => {
    try {
      downloadReceiptAsFile(receipt);
      setSuccess(true);
      setTimeout(() => {
        handleClose();
      }, 1500);
    } catch (error) {
      alert('Failed to download receipt. Please try again.');
    }
  };

  const handleClose = () => {
    setSelectedMethod(null);
    setPhoneNumber(customerPhone || '');
    setEmail(customerEmail || '');
    setCustomMessage('');
    setIsSending(false);
    setSuccess(false);
    onClose();
  };

  const renderMethodSelection = () => (
    <div className="space-y-3">
      <p className="text-sm text-slate-400 mb-4">Choose how you'd like to share this receipt:</p>
      
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => setSelectedMethod('whatsapp')}
          className="flex items-center gap-3 p-4 rounded-lg bg-green-500/20 border border-green-500/50 hover:bg-green-500/30 transition-colors"
        >
          <MessageSquare className="w-6 h-6 text-green-400" />
          <span className="text-green-400 font-medium">WhatsApp</span>
        </button>

        <button
          onClick={() => setSelectedMethod('email')}
          className="flex items-center gap-3 p-4 rounded-lg bg-blue-500/20 border border-blue-500/50 hover:bg-blue-500/30 transition-colors"
        >
          <Mail className="w-6 h-6 text-blue-400" />
          <span className="text-blue-400 font-medium">Email</span>
        </button>

        <button
          onClick={() => setSelectedMethod('sms')}
          className="flex items-center gap-3 p-4 rounded-lg bg-purple-500/20 border border-purple-500/50 hover:bg-purple-500/30 transition-colors"
        >
          <Smartphone className="w-6 h-6 text-purple-400" />
          <span className="text-purple-400 font-medium">SMS</span>
        </button>

        <button
          onClick={handleCopy}
          className="flex items-center gap-3 p-4 rounded-lg bg-amber-500/20 border border-amber-500/50 hover:bg-amber-500/30 transition-colors"
        >
          <Copy className="w-6 h-6 text-amber-400" />
          <span className="text-amber-400 font-medium">Copy</span>
        </button>

        <button
          onClick={handleDownload}
          className="flex items-center gap-3 p-4 rounded-lg bg-slate-500/20 border border-slate-500/50 hover:bg-slate-500/30 transition-colors col-span-2"
        >
          <Download className="w-6 h-6 text-slate-400" />
          <span className="text-slate-400 font-medium">Download as Text</span>
        </button>
      </div>
    </div>
  );

  const renderWhatsAppForm = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => setSelectedMethod(null)}
          className="p-1 hover:bg-slate-700 rounded-lg transition-colors"
        >
          <X className="w-5 h-5 text-slate-400" />
        </button>
        <h3 className="text-lg font-semibold text-green-400 flex items-center gap-2">
          <MessageSquare className="w-5 h-5" />
          Send via WhatsApp
        </h3>
      </div>

      <Input
        label="Phone Number"
        type="tel"
        value={phoneNumber}
        onChange={(e) => setPhoneNumber(e.target.value)}
        placeholder="+250 788 123 456"
        required
      />

      <div className="space-y-2">
        <label className="text-sm text-slate-400">Custom Message (optional)</label>
        <textarea
          value={customMessage}
          onChange={(e) => setCustomMessage(e.target.value)}
          placeholder="Add a personal note..."
          className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
          rows={3}
        />
      </div>

      <div className="flex gap-3 pt-4">
        <Button
          variant="primary"
          className="flex-1 bg-green-600 hover:bg-green-700"
          onClick={() => handleShare('whatsapp')}
          isLoading={isSending}
        >
          {isSending ? 'Sending...' : 'Send via WhatsApp'}
        </Button>
        <Button
          variant="secondary"
          className="flex-1"
          onClick={handleClose}
        >
          Cancel
        </Button>
      </div>

      {success && (
        <p className="text-green-400 text-sm text-center mt-2">
          ✓ Receipt sent successfully!
        </p>
      )}
    </div>
  );

  const renderEmailForm = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => setSelectedMethod(null)}
          className="p-1 hover:bg-slate-700 rounded-lg transition-colors"
        >
          <X className="w-5 h-5 text-slate-400" />
        </button>
        <h3 className="text-lg font-semibold text-blue-400 flex items-center gap-2">
          <Mail className="w-5 h-5" />
          Send via Email
        </h3>
      </div>

      <Input
        label="Email Address"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="customer@example.com"
        required
      />

      <div className="space-y-2">
        <label className="text-sm text-slate-400">Custom Message (optional)</label>
        <textarea
          value={customMessage}
          onChange={(e) => setCustomMessage(e.target.value)}
          placeholder="Add a personal note..."
          className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          rows={3}
        />
      </div>

      <div className="flex gap-3 pt-4">
        <Button
          variant="primary"
          className="flex-1 bg-blue-600 hover:bg-blue-700"
          onClick={() => handleShare('email')}
          isLoading={isSending}
        >
          {isSending ? 'Sending...' : 'Send via Email'}
        </Button>
        <Button
          variant="secondary"
          className="flex-1"
          onClick={handleClose}
        >
          Cancel
        </Button>
      </div>

      {success && (
        <p className="text-blue-400 text-sm text-center mt-2">
          ✓ Receipt sent successfully!
        </p>
      )}
    </div>
  );

  const renderSMSForm = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => setSelectedMethod(null)}
          className="p-1 hover:bg-slate-700 rounded-lg transition-colors"
        >
          <X className="w-5 h-5 text-slate-400" />
        </button>
        <h3 className="text-lg font-semibold text-purple-400 flex items-center gap-2">
          <Smartphone className="w-5 h-5" />
          Send via SMS
        </h3>
      </div>

      <Input
        label="Phone Number"
        type="tel"
        value={phoneNumber}
        onChange={(e) => setPhoneNumber(e.target.value)}
        placeholder="+250 788 123 456"
        required
      />

      <div className="space-y-2">
        <label className="text-sm text-slate-400">Custom Message (optional)</label>
        <textarea
          value={customMessage}
          onChange={(e) => setCustomMessage(e.target.value)}
          placeholder="Add a personal note..."
          className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
          rows={3}
        />
      </div>

      <div className="flex gap-3 pt-4">
        <Button
          variant="primary"
          className="flex-1 bg-purple-600 hover:bg-purple-700"
          onClick={() => handleShare('sms')}
          isLoading={isSending}
        >
          {isSending ? 'Sending...' : 'Send via SMS'}
        </Button>
        <Button
          variant="secondary"
          className="flex-1"
          onClick={handleClose}
        >
          Cancel
        </Button>
      </div>

      {success && (
        <p className="text-purple-400 text-sm text-center mt-2">
          ✓ Receipt sent successfully!
        </p>
      )}
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Share Receipt"
      size="md"
    >
      {selectedMethod === null && renderMethodSelection()}
      {selectedMethod === 'whatsapp' && renderWhatsAppForm()}
      {selectedMethod === 'email' && renderEmailForm()}
      {selectedMethod === 'sms' && renderSMSForm()}
    </Modal>
  );
}