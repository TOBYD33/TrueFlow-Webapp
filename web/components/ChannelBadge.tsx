// ChannelBadge.tsx
// Shows how a receipt was uploaded: WhatsApp, App, or Web

import { Badge } from '@/components/ui/badge'

interface ChannelBadgeProps {
  channel: 'whatsapp' | 'app' | 'web'
}

const config = {
  whatsapp: { label: 'WhatsApp', className: 'bg-green-100 text-green-700 border-green-200' },
  app: { label: 'Mobile App', className: 'bg-blue-100 text-blue-700 border-blue-200' },
  web: { label: 'Web', className: 'bg-purple-100 text-purple-700 border-purple-200' },
}

export function ChannelBadge({ channel }: ChannelBadgeProps) {
  const { label, className } = config[channel] ?? config.web
  return (
    <Badge variant="outline" className={className}>
      {label}
    </Badge>
  )
}
