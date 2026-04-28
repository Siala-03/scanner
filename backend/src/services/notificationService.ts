// WhatsApp notification service via Twilio WhatsApp API.
// Requires: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM (e.g. whatsapp:+14155238886)
// All functions fail silently — a missing config never crashes the server.

let twilioClient: any = null;

async function getClient() {
  if (twilioClient) return twilioClient;
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return null;
  try {
    const mod = await import('twilio');
    const Twilio = mod.default ?? mod;
    twilioClient = Twilio(sid, token);
    return twilioClient;
  } catch (err) {
    console.error('[WhatsApp] Failed to initialise Twilio:', err);
    return null;
  }
}

function waPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  let e164: string;
  if (digits.startsWith('250')) e164 = `+${digits}`;
  else if (digits.startsWith('0') && digits.length === 10) e164 = `+250${digits.slice(1)}`;
  else if (digits.length === 9) e164 = `+250${digits}`;
  else e164 = `+${digits}`;
  return `whatsapp:${e164}`;
}

export async function sendWhatsApp(phone: string, message: string): Promise<void> {
  const client = await getClient();
  if (!client) return;
  const from = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886';
  try {
    await client.messages.create({ from, to: waPhone(phone), body: message });
  } catch (err) {
    console.error('[WhatsApp] Send error:', err);
  }
}

export async function notifyOrderReady(
  customerPhone: string,
  orderNumber: string,
  tableNumber?: number
): Promise<void> {
  if (!customerPhone) return;
  const location = tableNumber ? `Table ${tableNumber}` : 'your pickup area';
  const message = `Hi! 🍽️ Your order *#${orderNumber}* is ready. Please collect it from *${location}*. Thank you for choosing SERVV!`;
  await sendWhatsApp(customerPhone, message);
}

export async function notifyReservationConfirmed(
  phone: string,
  customerName: string,
  date: string,
  time: string,
  tableNumber?: number
): Promise<void> {
  if (!phone) return;
  const table = tableNumber ? ` at *Table ${tableNumber}*` : '';
  const message = `Hi *${customerName}* 👋\n\nYour reservation is *confirmed!*\n📅 ${date} at 🕐 ${time}${table}\n\nWe look forward to seeing you. - SERVV`;
  await sendWhatsApp(phone, message);
}

export async function notifyReservationReminder(
  phone: string,
  customerName: string,
  date: string,
  time: string
): Promise<void> {
  if (!phone) return;
  const message = `⏰ Reminder, *${customerName}*! Your reservation is today at *${time}* (${date}). See you soon! - SERVV`;
  await sendWhatsApp(phone, message);
}

export async function notifyLowStock(
  managerPhone: string,
  itemName: string,
  quantity: number,
  unit?: string
): Promise<void> {
  if (!managerPhone) return;
  const unitStr = unit ? ` ${unit}` : '';
  const message = `⚠️ *SERVV Low Stock Alert*\n\n*${itemName}* has only *${quantity}${unitStr}* remaining. Please reorder soon.`;
  await sendWhatsApp(managerPhone, message);
}
