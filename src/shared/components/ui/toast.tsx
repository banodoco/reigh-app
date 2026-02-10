import * as React from "react"
import { Toast } from "@base-ui-components/react/toast"
import type { ToastRootToastObject } from "@base-ui-components/react/toast"
import { cva, type VariantProps } from "class-variance-authority"
import { X } from "lucide-react"
import { cn } from "@/shared/lib/utils"

// ── Global toast manager (singleton) ────────────────────────────────────────
// This is created once and shared across the app. It can be used outside of
// React components (e.g. in utility functions) via the `toast()` wrapper.
export const toastManager = Toast.createToastManager()

// ── Variant styles ──────────────────────────────────────────────────────────
const toastVariants = cva(
  "group pointer-events-auto relative flex w-full items-center justify-between space-x-4 overflow-hidden rounded-md border p-6 pr-8 shadow-lg transition-all",
  {
    variants: {
      variant: {
        default: "border bg-background text-foreground",
        destructive:
          "destructive group border-destructive bg-destructive text-destructive-foreground",
        success: "border bg-background text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

// ── Toast type → variant mapping ────────────────────────────────────────────
function typeToVariant(type?: string): "default" | "destructive" | "success" {
  if (type === "error" || type === "destructive") return "destructive"
  if (type === "success") return "success"
  return "default"
}

// ── Individual toast renderer ───────────────────────────────────────────────
export function ToastItem({ toast: t }: { toast: ToastRootToastObject }) {
  const variant = typeToVariant(t.type)
  return (
    <Toast.Root
      toast={t}
      className={cn(
        toastVariants({ variant }),
        "data-[ending-style]:opacity-0 data-[starting-style]:opacity-0",
        "data-[ending-style]:translate-x-full data-[starting-style]:translate-y-2",
        "transition-all duration-300"
      )}
    >
      <div className="grid gap-1 flex-1">
        {t.title && (
          <Toast.Title className="text-sm font-light">
            {t.title}
          </Toast.Title>
        )}
        {t.description && (
          <Toast.Description className="text-sm opacity-90">
            {t.description}
          </Toast.Description>
        )}
      </div>
      {t.actionProps && (
        <Toast.Action
          className={cn(
            "inline-flex h-8 shrink-0 items-center justify-center rounded-md border bg-transparent px-3 text-sm font-light ring-offset-background transition-colors hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
            "group-[.destructive]:border-muted/40 group-[.destructive]:hover:border-destructive/30 group-[.destructive]:hover:bg-destructive group-[.destructive]:hover:text-destructive-foreground group-[.destructive]:focus:ring-destructive"
          )}
          {...t.actionProps}
        />
      )}
      <Toast.Close
        className={cn(
          "absolute right-2 top-2 rounded-md p-1 text-foreground/50 opacity-0 transition-opacity hover:text-foreground focus:opacity-100 focus:outline-none focus:ring-2 group-hover:opacity-100",
          "group-[.destructive]:text-red-300 group-[.destructive]:hover:text-red-50 group-[.destructive]:focus:ring-red-400 group-[.destructive]:focus:ring-offset-red-600"
        )}
      >
        <X className="h-4 w-4" />
      </Toast.Close>
    </Toast.Root>
  )
}

// ── Sonner-compatible `toast` function ──────────────────────────────────────
// Supports:
//   toast("message")                            – default toast
//   toast.error("message")                      – error toast
//   toast.error("title", { description, ... })  – error with options
//   toast.success("message")                    – success toast
//   toast.success("msg", { description, ... })  – success with options
//   toast({ title, description, variant })      – object form

interface ToastObjectOptions {
  title?: React.ReactNode
  description?: React.ReactNode
  variant?: "default" | "destructive"
  action?: React.ReactElement
}

interface SonnerMethodOptions {
  description?: React.ReactNode
  duration?: number
  id?: string
}

function addToast(
  type: string,
  title: React.ReactNode,
  description?: React.ReactNode,
  opts?: SonnerMethodOptions
): string {
  return toastManager.add({
    type,
    title,
    description: description ?? opts?.description,
    timeout: opts?.duration,
    id: opts?.id,
  })
}

type ToastInput = string | ToastObjectOptions

function toastFn(input: ToastInput, opts?: SonnerMethodOptions): string {
  if (typeof input === "string") {
    // toast("message") or toast("message", { duration })
    return addToast("default", input, undefined, opts)
  }

  // Object form: toast({ title, description, variant })
  const { title, description, variant } = input
  const type = variant === "destructive" ? "error" : "default"
  return toastManager.add({
    type,
    title: title ?? undefined,
    description: description ?? undefined,
  })
}

toastFn.error = (
  message: string,
  opts?: SonnerMethodOptions
): string => {
  return addToast("error", message, opts?.description, opts)
}

toastFn.success = (
  message: string,
  opts?: SonnerMethodOptions
): string => {
  return addToast("success", message, opts?.description, opts)
}

toastFn.warning = (
  message: string,
  opts?: SonnerMethodOptions
): string => {
  return addToast("warning", message, opts?.description, opts)
}

toastFn.info = (
  message: string,
  opts?: SonnerMethodOptions
): string => {
  return addToast("info", message, opts?.description, opts)
}

export const toast = toastFn

// ── Type exports (backwards compat) ─────────────────────────────────────────
type ToastProps = React.ComponentPropsWithoutRef<typeof Toast.Root> & VariantProps<typeof toastVariants>
type ToastActionElement = React.ReactElement<typeof Toast.Action>

export { toastVariants }
