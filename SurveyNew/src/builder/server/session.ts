import { create } from "zustand"
import { createLampClient, type Credentials, type LampClient } from "./lampApi"

/**
 * Server connection for this browser tab. Credentials live in memory only, or in sessionStorage
 * (cleared when the tab closes) if the user ticks "remember for this tab". The server address is
 * remembered in localStorage for convenience.
 */
interface SessionState {
  creds: Credentials | null
  client: LampClient | null
  /** Set when an admin account picked a researcher to work as. */
  researcherId: string | null
  connect: (creds: Credentials, rememberForTab: boolean, researcherId?: string | null) => void
  setResearcher: (id: string | null) => void
  disconnect: () => void
}

const TAB_KEY = "surveynew-builder-session"
export const SERVER_URL_KEY = "surveynew-builder-server-url"

function restore(): Pick<SessionState, "creds" | "client" | "researcherId"> {
  try {
    const raw = sessionStorage.getItem(TAB_KEY)
    if (raw) {
      const { creds, researcherId } = JSON.parse(raw) as { creds: Credentials; researcherId: string | null }
      return { creds, client: createLampClient(creds), researcherId }
    }
  } catch {
    /* ignore */
  }
  return { creds: null, client: null, researcherId: null }
}

export const useSession = create<SessionState>()((set, get) => ({
  ...restore(),
  connect: (creds, rememberForTab, researcherId = null) => {
    try {
      localStorage.setItem(SERVER_URL_KEY, creds.serverUrl)
      if (rememberForTab) sessionStorage.setItem(TAB_KEY, JSON.stringify({ creds, researcherId }))
      else sessionStorage.removeItem(TAB_KEY)
    } catch {
      /* ignore */
    }
    set({ creds, client: createLampClient(creds), researcherId })
  },
  setResearcher: (id) => {
    set({ researcherId: id })
    try {
      const raw = sessionStorage.getItem(TAB_KEY)
      if (raw) sessionStorage.setItem(TAB_KEY, JSON.stringify({ ...JSON.parse(raw), researcherId: id }))
    } catch {
      /* ignore */
    }
    void get
  },
  disconnect: () => {
    try {
      sessionStorage.removeItem(TAB_KEY)
    } catch {
      /* ignore */
    }
    set({ creds: null, client: null, researcherId: null })
  },
}))

export function rememberedServerUrl(): string {
  try {
    return localStorage.getItem(SERVER_URL_KEY) ?? ""
  } catch {
    return ""
  }
}
