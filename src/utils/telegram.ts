import axios from 'axios';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

export const sendTelegramMessage = async (message: string): Promise<void> => {
  try {
    if (!BOT_TOKEN || !CHAT_ID) {
      console.warn('[Telegram] BOT_TOKEN or CHAT_ID is not configured');
      return;
    }
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: CHAT_ID,
      text: message,
      parse_mode: 'HTML',
    });
  } catch (err: any) {
    console.error('Telegram notification failed:', err.response?.data || err.message);
  }
};
