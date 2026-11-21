import axios from 'axios';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

/**
 * Escape user-supplied text for Telegram's HTML parse mode. Without this, a "<" or "&" in a form
 * (e.g. "<3") makes Telegram reject the whole message and the team gets no alert.
 */
export const escapeTelegramHtml = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .slice(0, 1500);

/** Sends an HTML message. Never throws; returns false when the alert could not be delivered. */
export const sendTelegramMessage = async (message: string): Promise<boolean> => {
  try {
    if (!BOT_TOKEN || !CHAT_ID) {
      console.warn('[Telegram] BOT_TOKEN or CHAT_ID is not configured');
      return false;
    }
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: CHAT_ID,
      text: message,
      parse_mode: 'HTML',
    }, { timeout: 8000 });
    return true;
  } catch (err: any) {
    console.error('Telegram notification failed:', err.response?.data || err.message);
    return false;
  }
};
