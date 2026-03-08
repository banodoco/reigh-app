import * as React from "react"
import { Toast } from "@base-ui-components/react/toast"
import type { ToastRootToastObject } from "@base-ui-components/react/toast"
import { cva, type VariantProps } from "class-variance-authority"
import { X } from "lucide-react"
import { cn } from "@/shared/components/ui/contracts/cn"
import { getToastManager, initializeToastManager } from '@/shared/runtime/toastRuntime'

// ── Variant styles ──────────────────────────────────────────────────────────
const toastVariants = cva(
  "group pointer-events-auto relative flex w-full items-center justify-between gap-x-4 overflow-hidden rounded-md border p-6 pr-8 shadow-lg transition-all",
  {
    variants: {
      variant: {
        default: "border bg-background text-foreground",
        destructive:
          "destructive group border-destructive bg-destructive text-destructive-foreground",
        success: "border bg-background text-foreground",
        warning: "border-amber-200 bg-amber-50 text-amber-950",
        info: "border-sky-200 bg-sky-50 text-sky-950",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

// ── Toast type → variant mapping ────────────────────────────────────────────
function typeToVariant(type?: string): "default" | "destructive" | "success" | "warning" | "info" {
  if (type === "error" || type === "destructive") return "destructive"
  if (type === "success") return "success"
  if (type === "warning") return "warning"
  if (type === "info") return "info"
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
  variant?: "default" | "destructive" | "success" | "warning" | "info"
  action?: React.ReactElement
}

interface SonnerMethodOptions {
  description?: React.ReactNode
  duration?: number
  id?: string
}

function scheduleToastDispatch(dispatch: () => void): void {
  // Macrotask scheduling keeps toast-manager updates out of the current React
  // render/effect lifecycle, avoiding nested flushSync warnings.
  setTimeout(dispatch, 0)
}

function addToast(
  type: string,
  title: React.ReactNode,
  description?: React.ReactNode,
  opts?: SonnerMethodOptions
): string {
  // Pre-generate an ID so we can return it synchronously while deferring the
  // actual add. We schedule on a macrotask so toast-manager updates do not run
  // during the same React lifecycle turn as the caller.
  const id = opts?.id ?? `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`
  scheduleToastDispatch(() => {
    const manager = initializeToastManager()
    manager.add({
      type,
      title,
      description: description ?? opts?.description,
      timeout: opts?.duration,
      id,
    })
  })
  return id
}

type ToastInput = string | ToastObjectOptions

function toastFn(input: ToastInput, opts?: SonnerMethodOptions): string {
  if (typeof input === "string") {
    // toast("message") or toast("message", { duration })
    return addToast("default", input, undefined, opts)
  }

  // Object form: toast({ title, description, variant })
  const { title, description, variant } = input
  const type = variant === "destructive" ? "error" : (variant ?? "default")
  const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`
  scheduleToastDispatch(() => {
    const manager = initializeToastManager()
    manager.add({
      type,
      title: title ?? undefined,
      description: description ?? undefined,
      id,
    })
  })
  return id
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


