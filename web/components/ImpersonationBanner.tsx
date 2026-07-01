'use client'
// ImpersonationBanner.tsx
// Fixed amber banner shown on every page during an active admin impersonation session.
// Cannot be dismissed — only removed by clicking Exit impersonation.

interface Props {
  userName: string
  sessionId: string
}

export function ImpersonationBanner({ userName, sessionId }: Props) {
  async function endSession() {
    await fetch('/api/admin/impersonation/end', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    })
    window.location.href = '/admin/users'
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        background: '#EF9F27',
        color: '#0A0A0F',
        padding: '10px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: '13px',
        fontWeight: 500,
        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
      }}
    >
      <span>
        👁 Viewing as <strong>{userName}</strong> · Your actions here are logged · Read-only mode active
      </span>
      <button
        onClick={endSession}
        style={{
          background: '#0A0A0F',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          padding: '6px 16px',
          cursor: 'pointer',
          fontSize: '12px',
          fontWeight: 600,
          flexShrink: 0,
          marginLeft: '16px',
        }}
      >
        Exit impersonation
      </button>
    </div>
  )
}
