import * as React from 'react';

const Slot = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(
  ({ children, ...props }, forwardedRef) => {
    if (!React.isValidElement(children)) {
      return null;
    }

    const child = children as React.ReactElement<Record<string, unknown>> & {
      ref?: React.Ref<HTMLElement>;
    };

    return React.cloneElement(child, {
      ...mergeProps(props, child.props),
      ref: forwardedRef ? composeRefs(forwardedRef, child.ref) : child.ref,
    } as Record<string, unknown>);
  }
);

Slot.displayName = 'Slot';

function mergeProps(
  slotProps: Record<string, unknown>,
  childProps: Record<string, unknown>
): Record<string, unknown> {
  const overrideProps: Record<string, unknown> = { ...childProps };

  for (const propName in childProps) {
    const slotPropValue = slotProps[propName];
    const childPropValue = childProps[propName];

    const isHandler = /^on[A-Z]/.test(propName);
    if (isHandler) {
      if (typeof slotPropValue === 'function' && typeof childPropValue === 'function') {
        overrideProps[propName] = (...args: unknown[]) => {
          (childPropValue as (...eventArgs: unknown[]) => void)(...args);
          (slotPropValue as (...eventArgs: unknown[]) => void)(...args);
        };
      } else if (typeof slotPropValue === 'function') {
        overrideProps[propName] = slotPropValue;
      }
    } else if (propName === 'style') {
      const slotStyle = typeof slotPropValue === 'object' && slotPropValue ? slotPropValue : {};
      const childStyle = typeof childPropValue === 'object' && childPropValue ? childPropValue : {};
      overrideProps[propName] = { ...slotStyle, ...childStyle };
    } else if (propName === 'className') {
      overrideProps[propName] = [slotPropValue, childPropValue].filter(Boolean).join(' ');
    }
  }

  return { ...slotProps, ...overrideProps };
}

function composeRefs<T>(...refs: (React.Ref<T> | undefined | null)[]): React.RefCallback<T> {
  return (node) => {
    refs.forEach((ref) => {
      if (typeof ref === 'function') {
        ref(node);
      } else if (ref != null) {
        (ref as React.MutableRefObject<T | null>).current = node;
      }
    });
  };
}

export { Slot };
