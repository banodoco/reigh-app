// Re-exports the unified toast API backed by Base UI Toast.
// This file exists for backwards compatibility with code that imports from
// "@/shared/hooks/use-toast" (the old Radix toast hook location).

import { toast } from "@/shared/components/ui/toast"

export { toast }

// useToast shim: returns the toast function for call-site compat with
// `const { toast } = useToast()`. No React state needed because the
// Base UI Toast.Provider manages state internally.
export function useToast() {
  return { toast }
}
