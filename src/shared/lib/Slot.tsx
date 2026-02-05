import * as React from "react"

/**
 * Local Slot implementation replacing @radix-ui/react-slot.
 * Merges props onto a single React element child, enabling the `asChild` pattern.
 */
const Slot = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(
  ({ children, ...props }, forwardedRef) => {
    if (!React.isValidElement(children)) {
      return null
    }

    return React.cloneElement(children as React.ReactElement, {
      ...mergeProps(props, (children as React.ReactElement).props),
      ref: forwardedRef
        ? composeRefs(forwardedRef, (children as any).ref)
        : (children as any).ref,
    })
  }
)
Slot.displayName = "Slot"

function mergeProps(
  slotProps: Record<string, any>,
  childProps: Record<string, any>
) {
  const overrideProps = { ...childProps }

  for (const propName in childProps) {
    const slotPropValue = slotProps[propName]
    const childPropValue = childProps[propName]

    const isHandler = /^on[A-Z]/.test(propName)
    if (isHandler) {
      if (slotPropValue && childPropValue) {
        overrideProps[propName] = (...args: unknown[]) => {
          childPropValue(...args)
          slotPropValue(...args)
        }
      } else if (slotPropValue) {
        overrideProps[propName] = slotPropValue
      }
    } else if (propName === "style") {
      overrideProps[propName] = { ...slotPropValue, ...childPropValue }
    } else if (propName === "className") {
      overrideProps[propName] = [slotPropValue, childPropValue]
        .filter(Boolean)
        .join(" ")
    }
  }

  return { ...slotProps, ...overrideProps }
}

function composeRefs<T>(
  ...refs: (React.Ref<T> | undefined | null)[]
): React.RefCallback<T> {
  return (node) => {
    refs.forEach((ref) => {
      if (typeof ref === "function") {
        ref(node)
      } else if (ref != null) {
        ;(ref as React.MutableRefObject<T | null>).current = node
      }
    })
  }
}

export { Slot }
