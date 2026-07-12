'use client'
// components/dashboard-concept/ConceptProvider.tsx
// Scoped context for the /dashboard-concept route ONLY.
// Carries org identity (from the concept layout) plus the light/dark theme
// state for the concept redesign. Deliberately separate from the live
// dashboard's ViewingContext so the concept can be deleted with zero impact.

import { createContext, useContext, useState } from 'react'

interface ConceptContextValue {
  orgId: string | null
  orgName: string
  plan: string
  dark: boolean
  setDark: (d: boolean) => void
}

const ConceptContext = createContext<ConceptContextValue>({
  orgId: null,
  orgName: 'TrueFlow',
  plan: 'free',
  dark: false,
  setDark: () => {},
})

export function ConceptProvider({
  children,
  orgId,
  orgName,
  plan,
}: {
  children: React.ReactNode
  orgId: string | null
  orgName: string
  plan: string
}) {
  // Light mode is the default for the concept redesign
  const [dark, setDark] = useState(false)

  return (
    <ConceptContext.Provider value={{ orgId, orgName, plan, dark, setDark }}>
      {children}
    </ConceptContext.Provider>
  )
}

export function useConcept(): ConceptContextValue {
  return useContext(ConceptContext)
}
