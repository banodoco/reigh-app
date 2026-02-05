import { useTheme } from "next-themes"
import { Toast } from "@base-ui-components/react/toast"
import { toastManager, ToastItem, toast } from "./toast"
import { usePanes } from "@/shared/contexts/PanesContext"

interface ToasterProps {
  /** Max toasts visible at once. @default 3 */
  limit?: number
  /** Default timeout in ms. @default 5000 */
  timeout?: number
}

function ToastList() {
  const { toasts } = Toast.useToastManager()
  const { isTasksPaneLocked, tasksPaneWidth } = usePanes()

  const rightOffset = isTasksPaneLocked ? tasksPaneWidth : 0

  return (
    <Toast.Viewport
      className="fixed bottom-0 right-0 z-[100] flex max-h-screen w-full flex-col gap-2 p-4 md:max-w-[420px]"
      style={rightOffset > 0 ? { right: `${rightOffset}px` } : undefined}
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </Toast.Viewport>
  )
}

const Toaster = ({ limit = 3, timeout = 5000 }: ToasterProps = {}) => {
  // next-themes integration (unused for now since we use Tailwind CSS vars,
  // but kept for parity with original sonner.tsx and future theme needs)
  const { theme = "system" } = useTheme()

  return (
    <Toast.Provider toastManager={toastManager} timeout={timeout} limit={limit}>
      <ToastList />
    </Toast.Provider>
  )
}

export { Toaster, toast }
