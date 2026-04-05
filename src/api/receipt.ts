import { ReceiptData } from '../utils/receipt';

/**
 * Send receipt via WhatsApp
 * Uses WhatsApp's click-to-chat feature to open a chat with pre-filled message
 */
export interface SendWhatsAppReceiptOptions {
  phoneNumber: string; // Customer's phone number (with country code, e.g., +250788123456)
  receipt: ReceiptData;
  message?: string; // Custom message to include
}

export function sendReceiptViaWhatsApp(options: SendWhatsAppReceiptOptions): void {
  const { phoneNumber, receipt, message } = options;
  
  // Format the receipt as a text message
  const receiptText = formatReceiptAsText(receipt, message);
  
  // Encode the message for URL
  const encodedMessage = encodeURIComponent(receiptText);
  
  // Create WhatsApp URL (using wa.me for universal compatibility)
  // Remove any non-numeric characters from phone number except +
  const cleanPhoneNumber = phoneNumber.replace(/[^\d+]/g, '');
  const whatsappUrl = `https://wa.me/${cleanPhoneNumber}?text=${encodedMessage}`;
  
  // Open WhatsApp in new window
  const newWindow = window.open(whatsappUrl, '_blank');
  if (!newWindow) {
    console.error('Failed to open WhatsApp. Please ensure pop-ups are allowed.');
    // Fallback: try to copy to clipboard
    navigator.clipboard.writeText(receiptText).catch(() => {
      console.warn('Could not copy receipt text to clipboard');
    });
    alert('Could not open WhatsApp. Receipt text has been copied to your clipboard.');
  }
}

/**
 * Send receipt via Email
 * Uses mailto: link with receipt as email body
 */
export interface SendEmailReceiptOptions {
  email: string; // Customer's email address
  receipt: ReceiptData;
  subject?: string; // Email subject
  message?: string; // Custom message to include
  cc?: string; // CC email address
  bcc?: string; // BCC email address
}

export function sendReceiptViaEmail(options: SendEmailReceiptOptions): void {
  const { email, receipt, subject, message, cc, bcc } = options;
  
  // Default subject
  const emailSubject = subject || `Receipt - ${receipt.restaurantName} - Order ${receipt.orderNumber}`;
  
  // Format receipt as HTML for email
  const emailBody = formatReceiptAsHTML(receipt, message);
  
  // Create mailto URL
  const mailtoUrl = new URL('mailto:' + email);
  mailtoUrl.searchParams.append('subject', emailSubject);
  mailtoUrl.searchParams.append('body', emailBody);
  
  if (cc) {
    mailtoUrl.searchParams.append('cc', cc);
  }
  
  if (bcc) {
    mailtoUrl.searchParams.append('bcc', bcc);
  }
  
  // Open email client
  const newWindow = window.open(mailtoUrl.toString(), '_self');
  if (!newWindow) {
    console.error('Failed to open email client.');
    // Fallback: try to copy to clipboard
    navigator.clipboard.writeText(emailBody).catch(() => {
      console.warn('Could not copy receipt text to clipboard');
    });
    alert('Could not open email client. Receipt has been copied to your clipboard.');
  }
}

/**
 * Send receipt via SMS
 * Uses sms: link with pre-filled message
 */
export interface SendSMSReceiptOptions {
  phoneNumber: string; // Customer's phone number
  receipt: ReceiptData;
  message?: string; // Custom message to include
}

export function sendReceiptViaSMS(options: SendSMSReceiptOptions): void {
  const { phoneNumber, receipt, message } = options;
  
  // Format receipt as concise text for SMS
  const smsText = formatReceiptAsSMS(receipt, message);
  
  // Encode the message
  const encodedMessage = encodeURIComponent(smsText);
  
  // Create SMS URL (using universal sms: scheme)
  const cleanPhoneNumber = phoneNumber.replace(/[^\d+]/g, '');
  
  // Different formats for different platforms
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const smsUrl = isIOS 
    ? `sms:${cleanPhoneNumber}&body=${encodedMessage}`
    : `sms:${cleanPhoneNumber}?body=${encodedMessage}`;
  
  // Open SMS app
  const newWindow = window.open(smsUrl, '_blank');
  if (!newWindow) {
    console.error('Failed to open SMS app.');
    // Fallback: try to copy to clipboard
    navigator.clipboard.writeText(smsText).catch(() => {
      console.warn('Could not copy receipt text to clipboard');
    });
    alert('Could not open SMS app. Receipt text has been copied to your clipboard.');
  }
}

/**
 * Format receipt as plain text for WhatsApp/SMS
 */
function formatReceiptAsText(receipt: ReceiptData, customMessage?: string): string {
  const lines: string[] = [];
  
  // Header
  lines.push(`*${receipt.restaurantName}*`);
  lines.push(receipt.restaurantAddress);
  lines.push(receipt.restaurantPhone);
  lines.push('');
  
  // Receipt info
  lines.push('*RECEIPT*');
  lines.push(`Order: ${receipt.orderNumber}`);
  lines.push(`Date: ${new Date(receipt.orderDate).toLocaleString()}`);
  if (receipt.tableNumber) lines.push(`Table: ${receipt.tableNumber}`);
  lines.push(`Server: ${receipt.serverName}`);
  lines.push('');
  
  // Items
  lines.push('*Items:*');
  receipt.items.forEach(item => {
    const itemTotal = item.totalPrice.toFixed(2);
    lines.push(`${item.quantity}x ${item.name} - $${itemTotal}`);
    if (item.specialInstructions) {
      lines.push(`   Note: ${item.specialInstructions}`);
    }
  });
  lines.push('');
  
  // Totals
  lines.push('*Summary:*');
  lines.push(`Subtotal: $${receipt.subtotal.toFixed(2)}`);
  if (receipt.taxRate > 0) {
    lines.push(`Tax (${receipt.taxRate}%): $${receipt.taxAmount.toFixed(2)}`);
  }
  lines.push(`*Total: $${receipt.total.toFixed(2)}*`);
  lines.push('');
  
  // Payment
  lines.push(`Payment: ${receipt.paymentMethod}`);
  lines.push(`Status: ${receipt.paymentStatus.toUpperCase()}`);
  lines.push('');
  
  // Loyalty points
  if (receipt.loyaltyPoints && receipt.loyaltyPoints.pointsEarned > 0) {
    lines.push('*Loyalty Points:*');
    lines.push(`Points Earned: +${receipt.loyaltyPoints.pointsEarned}`);
    lines.push(`Total Balance: ${receipt.loyaltyPoints.pointsBalance}`);
    lines.push('');
  }
  
  // Custom message
  if (customMessage) {
    lines.push(customMessage);
    lines.push('');
  }
  
  // Footer
  lines.push('Thank you for dining with us!');
  lines.push(`Receipt ID: ${receipt.receiptId}`);
  
  return lines.join('\n');
}

/**
 * Format receipt as HTML for email
 */
function formatReceiptAsHTML(receipt: ReceiptData, customMessage?: string): string {
  const itemsRows = receipt.items.map(item => `
    <tr>
      <td style="padding: 4px 8px; text-align: left;">${item.quantity}x ${item.name}</td>
      <td style="padding: 4px 8px; text-align: right;">$${item.totalPrice.toFixed(2)}</td>
    </tr>
  `).join('');
  
  const taxRow = receipt.taxRate > 0 ? `
    <tr>
      <td style="padding: 4px 8px; text-align: left;">Tax (${receipt.taxRate}%)</td>
      <td style="padding: 4px 8px; text-align: right;">$${receipt.taxAmount.toFixed(2)}</td>
    </tr>
  ` : '';
  
  const loyaltySection = receipt.loyaltyPoints && receipt.loyaltyPoints.pointsEarned > 0 ? `
    <div style="margin-top: 16px; padding: 12px; background: #f9f9f9; border: 1px dashed #ccc; text-align: center;">
      <strong>★ Loyalty Points ★</strong><br>
      Points Earned: +${receipt.loyaltyPoints.pointsEarned}<br>
      Total Balance: ${receipt.loyaltyPoints.pointsBalance} pts
    </div>
  ` : '';
  
  return `
<html>
<body style="font-family: Arial, sans-serif; max-width: 400px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 20px;">
    <h2 style="margin: 0;">${receipt.restaurantName}</h2>
    <p style="margin: 4px 0; color: #666;">${receipt.restaurantAddress}</p>
    <p style="margin: 4px 0; color: #666;">${receipt.restaurantPhone}</p>
  </div>
  
  <h3 style="text-align: center; margin: 20px 0 10px;">RECEIPT</h3>
  
  <table style="width: 100%; margin-bottom: 10px;">
    <tr>
      <td style="padding: 2px 0;">Order:</td>
      <td style="padding: 2px 0; text-align: right;">${receipt.orderNumber}</td>
    </tr>
    <tr>
      <td style="padding: 2px 0;">Date:</td>
      <td style="padding: 2px 0; text-align: right;">${new Date(receipt.orderDate).toLocaleString()}</td>
    </tr>
    ${receipt.tableNumber ? `<tr>
      <td style="padding: 2px 0;">Table:</td>
      <td style="padding: 2px 0; text-align: right;">${receipt.tableNumber}</td>
    </tr>` : ''}
    <tr>
      <td style="padding: 2px 0;">Server:</td>
      <td style="padding: 2px 0; text-align: right;">${receipt.serverName}</td>
    </tr>
  </table>
  
  <hr style="border: none; border-top: 1px solid #eee; margin: 16px 0;">
  
  <table style="width: 100%;">
    ${itemsRows}
  </table>
  
  <hr style="border: none; border-top: 1px solid #eee; margin: 16px 0;">
  
  <table style="width: 100%;">
    <tr>
      <td style="padding: 4px 0;">Subtotal:</td>
      <td style="padding: 4px 0; text-align: right;">$${receipt.subtotal.toFixed(2)}</td>
    </tr>
    ${taxRow}
    <tr style="font-weight: bold; font-size: 1.1em;">
      <td style="padding: 8px 0 4px;">TOTAL:</td>
      <td style="padding: 8px 0 4px; text-align: right;">$${receipt.total.toFixed(2)}</td>
    </tr>
  </table>
  
  <div style="margin-top: 16px; padding: 8px; background: #f5f5f5; border-radius: 4px;">
    <p style="margin: 4px 0;"><strong>Payment:</strong> ${receipt.paymentMethod}</p>
    <p style="margin: 4px 0;"><strong>Status:</strong> ${receipt.paymentStatus.toUpperCase()}</p>
  </div>
  
  ${loyaltySection}
  
  ${customMessage ? `<p style="margin-top: 16px; font-style: italic;">${customMessage}</p>` : ''}
  
  <hr style="border: none; border-top: 1px solid #eee; margin: 16px 0;">
  
  <div style="text-align: center; margin-top: 16px;">
    <p style="margin: 4px 0;">Thank you for dining with us!</p>
    <p style="margin: 4px 0; font-size: 0.8em; color: #999;">Receipt ID: ${receipt.receiptId}</p>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Format receipt as concise SMS
 */
function formatReceiptAsSMS(receipt: ReceiptData, customMessage?: string): string {
  const lines: string[] = [];
  
  lines.push(`${receipt.restaurantName}`);
  lines.push(`Order: ${receipt.orderNumber}`);
  lines.push(`Date: ${new Date(receipt.orderDate).toLocaleDateString()}`);
  lines.push('');
  
  // Items (abbreviated)
  receipt.items.forEach(item => {
    lines.push(`${item.quantity}x ${item.name} $${item.totalPrice.toFixed(2)}`);
  });
  lines.push('');
  
  lines.push(`Subtotal: $${receipt.subtotal.toFixed(2)}`);
  if (receipt.taxRate > 0) {
    lines.push(`Tax: $${receipt.taxAmount.toFixed(2)}`);
  }
  lines.push(`TOTAL: $${receipt.total.toFixed(2)}`);
  lines.push('');
  
  if (receipt.loyaltyPoints && receipt.loyaltyPoints.pointsEarned > 0) {
    lines.push(`Points: +${receipt.loyaltyPoints.pointsEarned}`);
    lines.push('');
  }
  
  if (customMessage) {
    lines.push(customMessage);
    lines.push('');
  }
  
  lines.push('Thank you!');
  
  return lines.join('\n');
}

/**
 * Copy receipt to clipboard
 */
export function copyReceiptToClipboard(receipt: ReceiptData): Promise<void> {
  const text = formatReceiptAsText(receipt);
  return navigator.clipboard.writeText(text).catch(err => {
    console.error('Failed to copy receipt:', err);
    throw new Error('Failed to copy receipt to clipboard');
  });
}

/**
 * Download receipt as text file
 */
export function downloadReceiptAsFile(receipt: ReceiptData, filename?: string): void {
  const text = formatReceiptAsText(receipt);
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `receipt-${receipt.orderNumber}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}