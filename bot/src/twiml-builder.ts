// twiml-builder.ts
// Builds Twilio TwiML XML response strings for WhatsApp messages.
// Twilio expects a TwiML response to its webhook — we build it here.

export function buildTextResponse(message: string): string {
  const escaped = escapeXml(message)
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${escaped}</Message>
</Response>`
}

export function buildMediaResponse(message: string, mediaUrl: string): string {
  const escaped = escapeXml(message)
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>
    <Body>${escaped}</Body>
    <Media>${escapeXml(mediaUrl)}</Media>
  </Message>
</Response>`
}

export function buildEmptyResponse(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response></Response>`
}

// Extracts plain text from a TwiML string — used when sending async replies via REST API
export function extractTextFromTwiml(twiml: string): string {
  const match = twiml.match(/<Message[^>]*>(?:<Body>)?([\s\S]*?)(?:<\/Body>)?<\/Message>/)
  if (!match) return ''
  return match[1]
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .trim()
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
