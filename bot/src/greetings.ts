// Greetings are deterministic: no AI request, financial context or actions.
// Match the entire message so a greeting followed by an instruction still routes normally.
export function isSimpleGreeting(text: string): boolean {
  const normalized = text.normalize('NFKC').trim()
    .replace(/[\u{1F44B}\u{1F3FB}-\u{1F3FF}\uFE0F]/gu, '')
    .replace(/[.,!?…]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
  return /^(?:hi|hello|hey|good morning|good afternoon|good evening)(?: trueflow)?$/.test(normalized)
}

export function buildGreeting(fullName?: string | null): string {
  const firstName = fullName?.normalize('NFKC').trim().split(/\s+/)[0] || ''
  const safeName = /^[\p{L}\p{M}][\p{L}\p{M}'’-]{0,39}$/u.test(firstName) ? firstName : ''
  return `Hi${safeName ? ' ' + safeName : ''} 👋 How can I help you today?`
}
