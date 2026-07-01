'use client'
// ViewingContext.tsx
// Passes the correct org/user context from the server layout down to all client pages.
// During impersonation, orgId and userId are the TARGET user's values, not the admin's.

import { createContext, useContext } from 'react'

export interface ViewingContextValue {
  orgId: string | null
  userId: string | null    // profile id of the user being viewed (target during impersonation)
  phone: string | null     // phone number (for WhatsApp conversation lookup)
  isImpersonating: boolean
}

const ViewingContext = createContext<ViewingContextValue>({
  orgId: null,
  userId: null,
  phone: null,
  isImpersonating: false,
})

export function ViewingContextProvider({
  children,
  orgId,
  userId,
  phone,
  isImpersonating,
}: ViewingContextValue & { children: React.ReactNode }) {
  return (
    <ViewingContext.Provider value={{ orgId, userId, phone, isImpersonating }}>
      {children}
    </ViewingContext.Provider>
  )
}

export function useViewingContext(): ViewingContextValue {
  return useContext(ViewingContext)
}
