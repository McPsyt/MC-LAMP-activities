import * as React from "react"

/**
 * Where Radix portals (dialogs, popovers, selects) should mount.
 * `undefined` = document.body (default). The builder's phone preview provides its
 * own element so overlays inherit the survey's theme tokens and stay inside the frame.
 */
const PortalContainerContext = React.createContext<HTMLElement | null | undefined>(undefined)

export const PortalContainerProvider = PortalContainerContext.Provider

export function usePortalContainer(): HTMLElement | undefined {
  return React.useContext(PortalContainerContext) ?? undefined
}
