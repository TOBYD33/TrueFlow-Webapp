// bank-reader.ts
// Nigerian bank name normalisation and WhatsApp message formatting helpers
// for Smart Transfer Recognition output.

import { TransferDetection } from './transfer-detector'

const BANK_ALIASES: Record<string, string> = {
  'gtbank': 'GTBank',
  'guaranty trust': 'GTBank',
  'guaranty trust bank': 'GTBank',
  'gtb': 'GTBank',
  'access': 'Access Bank',
  'access bank': 'Access Bank',
  'zenith': 'Zenith Bank',
  'zenith bank': 'Zenith Bank',
  'uba': 'UBA',
  'united bank for africa': 'UBA',
  'first bank': 'First Bank',
  'firstbank': 'First Bank',
  'fbn': 'First Bank',
  'first bank of nigeria': 'First Bank',
  'opay': 'Opay',
  'o-pay': 'Opay',
  'palmpay': 'PalmPay',
  'palm pay': 'PalmPay',
  'moniepoint': 'Moniepoint',
  'monie point': 'Moniepoint',
  'teamapt': 'Moniepoint',
  'kuda': 'Kuda Bank',
  'kuda bank': 'Kuda Bank',
  'stanbic': 'Stanbic IBTC',
  'stanbic ibtc': 'Stanbic IBTC',
  'sterling': 'Sterling Bank',
  'sterling bank': 'Sterling Bank',
  'wema': 'Wema Bank',
  'wema bank': 'Wema Bank',
  'fcmb': 'FCMB',
  'first city monument bank': 'FCMB',
  'polaris': 'Polaris Bank',
  'polaris bank': 'Polaris Bank',
  'union bank': 'Union Bank',
  'providus': 'Providus Bank',
  'providus bank': 'Providus Bank',
  'jaiz': 'Jaiz Bank',
  'jaiz bank': 'Jaiz Bank',
}

export function normaliseBankName(raw: string | null): string | null {
  if (!raw) return null
  return BANK_ALIASES[raw.toLowerCase().trim()] ?? raw
}

export function toTitleCase(str: string): string {
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
}

export function formatPaymentDate(iso: string | null): string {
  if (!iso) return 'today'
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    })
  } catch {
    return iso
  }
}

export function buildIncomingPaymentReply(
  transfer: TransferDetection,
  currency: string,
  matchedClientName: string | null
): string {
  const amount = transfer.amount
    ? `${currency} ${Number(transfer.amount).toLocaleString()}`
    : 'unknown amount'
  const sender = transfer.sender_name
    ? `*${toTitleCase(transfer.sender_name)}*`
    : 'Unknown sender'
  const bank = normaliseBankName(transfer.bank)
  const bankStr = bank ? ` (${bank})` : ''
  const dateStr = formatPaymentDate(transfer.date)
  const refStr = transfer.payment_reference
    ? `\nRef: ${transfer.payment_reference}`
    : ''
  const lowConfidence = transfer.confidence === 'low'
    ? '\n\n⚠️ Low confidence scan — please verify details on your web dashboard.'
    : ''

  if (matchedClientName) {
    return (
      `✅ *Payment received!*\n\n` +
      `*${amount}* from ${sender}${bankStr}\n` +
      `Date: ${dateStr}${refStr}\n\n` +
      `Logged to *${matchedClientName}*'s account.\n` +
      `Open your web dashboard to link it to a specific project.` +
      lowConfidence
    )
  }

  return (
    `📥 *Payment received!*\n\n` +
    `*${amount}* from ${sender}${bankStr}\n` +
    `Date: ${dateStr}${refStr}\n\n` +
    `I didn't find a matching client. Visit *Web dashboard → Income* to link this payment to a client.` +
    lowConfidence
  )
}
