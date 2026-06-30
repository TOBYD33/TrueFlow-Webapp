'use client'
// ImageUpload.tsx
// Reusable image upload component shared by the avatar (profile settings)
// and logo (business settings) upload flows. Resizes on the client using
// a canvas element before uploading so files are always under 200KB
// regardless of the original camera photo size (typically 3-8MB on phones).

import { useRef, useState } from 'react'
import { Camera, Loader2 } from 'lucide-react'

interface ImageUploadProps {
  currentUrl: string | null | undefined
  fallbackText: string
  shape: 'circle' | 'square'
  maxSizePx: number
  onUpload: (file: File, previewUrl: string) => void
  uploading?: boolean
}

// Resize an image File to fit within maxSizePx × maxSizePx using a canvas,
// always exporting as JPEG at 90% quality to keep file size small.
async function resizeImage(file: File, maxPx: number): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(objectUrl)

      const scale = Math.min(maxPx / img.width, maxPx / img.height, 1)
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)

      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, w, h)

      canvas.toBlob(
        blob => {
          if (!blob) { reject(new Error('Canvas toBlob failed')); return }
          resolve(new File([blob], 'upload.jpg', { type: 'image/jpeg' }))
        },
        'image/jpeg',
        0.9
      )
    }

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Image load failed'))
    }

    img.src = objectUrl
  })
}

export function ImageUpload({
  currentUrl,
  fallbackText,
  shape,
  maxSizePx,
  onUpload,
  uploading = false,
}: ImageUploadProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [resizing, setResizing] = useState(false)

  const displayUrl = preview ?? currentUrl ?? null
  const initials = fallbackText.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()
  const isRound = shape === 'circle'
  const busy = resizing || uploading

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) return

    setResizing(true)
    try {
      const resized = await resizeImage(file, maxSizePx)
      const previewUrl = URL.createObjectURL(resized)
      setPreview(previewUrl)
      onUpload(resized, previewUrl)
    } catch (err) {
      console.error('ImageUpload resize failed:', err)
    } finally {
      setResizing(false)
      // Reset so the same file can be re-selected
      e.target.value = ''
    }
  }

  return (
    <div className="relative shrink-0" style={{ display: 'inline-block' }}>
      <div
        className={[
          'w-20 h-20 overflow-hidden border-2 border-gray-200',
          'flex items-center justify-center',
          'bg-emerald-50 text-emerald-700',
          isRound ? 'rounded-full' : 'rounded-xl',
        ].join(' ')}
      >
        {displayUrl ? (
          <img
            src={displayUrl}
            alt={fallbackText}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-xl font-bold select-none">{initials}</span>
        )}
      </div>

      {/* Camera button overlay */}
      <button
        type="button"
        disabled={busy}
        onClick={() => fileRef.current?.click()}
        className={[
          'absolute bottom-0 right-0 w-7 h-7 rounded-full',
          'bg-emerald-600 text-white flex items-center justify-center',
          'shadow-md transition-colors',
          busy ? 'opacity-70 cursor-not-allowed' : 'hover:bg-emerald-700 cursor-pointer',
        ].join(' ')}
        aria-label="Upload image"
      >
        {busy
          ? <Loader2 size={12} className="animate-spin" />
          : <Camera size={12} />
        }
      </button>

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png"
        className="hidden"
        onChange={handleChange}
      />
    </div>
  )
}
