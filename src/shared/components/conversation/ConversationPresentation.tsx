import type { ReactNode, RefObject } from 'react';
import { Loader2 } from 'lucide-react';
import {
  ConversationAttachmentStrip,
  ConversationMessage,
  ConversationToolGroup,
} from './ConversationMessage.tsx';
import type {
  ConversationAttachment,
  ConversationItem,
  ConversationOptimisticMessage,
} from './contracts.ts';

export type ConversationPresentationProps = {
  items: readonly ConversationItem[];
  isLoading?: boolean;
  isProcessing?: boolean;
  hasPendingWork?: boolean;
  hideEmptyState?: boolean;
  emptyState?: ReactNode;
  headerActions?: ReactNode;
  footer?: ReactNode;
  optimisticMessage?: ConversationOptimisticMessage | null;
  optimisticMaterialized?: boolean;
  onAttachmentClick?: (attachment: ConversationAttachment) => void;
  scrollContainerRef?: RefObject<HTMLDivElement>;
  bottomAnchorRef?: RefObject<HTMLDivElement>;
  label?: string;
  avatarSrc?: string;
  className?: string;
};

/** Shared, host-neutral conversation presentation. State and side effects stay with the host. */
export function ConversationPresentation({
  items,
  isLoading = false,
  isProcessing = false,
  hasPendingWork = false,
  hideEmptyState = false,
  emptyState,
  headerActions,
  footer,
  optimisticMessage,
  optimisticMaterialized = false,
  onAttachmentClick,
  scrollContainerRef,
  bottomAnchorRef,
  label = 'Astrid',
  avatarSrc = '/astrid-avatar.png',
  className = '',
}: ConversationPresentationProps) {
  return (
    <div
      className={`flex h-full w-full flex-col overflow-hidden ${className}`.trim()}
      data-conversation-presentation="shared-v1"
    >
      <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
        <div className="flex items-end gap-2">
          <img src={avatarSrc} alt="" aria-hidden="true" className="h-5 w-5 rounded-full object-cover" />
          <span className="text-sm font-medium">{label}</span>
          {isProcessing && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </div>
        {headerActions && <div className="flex items-center gap-1">{headerActions}</div>}
      </div>

      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto overscroll-contain px-4 py-3">
        {isLoading && (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading...
          </div>
        )}

        {!isLoading && items.length === 0 && !isProcessing && !hideEmptyState && emptyState}

        <div className="flex flex-col gap-2.5">
          {items.map((item) => item.kind === 'message' ? (
            <ConversationMessage key={item.key} turn={item.turn} onAttachmentClick={onAttachmentClick} />
          ) : (
            <ConversationToolGroup key={item.key} pairs={item.pairs} />
          ))}

          {optimisticMessage && !optimisticMaterialized && (
            <div className="flex w-full justify-end">
              <div className="max-w-[85%] rounded-2xl bg-primary px-4 py-2.5 text-sm leading-relaxed text-primary-foreground shadow-sm">
                <div>{optimisticMessage.text}</div>
                {optimisticMessage.attachments.length > 0 && (
                  <ConversationAttachmentStrip attachments={optimisticMessage.attachments} isUser />
                )}
              </div>
            </div>
          )}

          {(isProcessing || hasPendingWork || optimisticMessage) && (
            <div className="flex items-center gap-2 py-1 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Thinking...
            </div>
          )}
        </div>
        <div ref={bottomAnchorRef} />
      </div>

      {footer && <div className="border-t border-border/70 px-3 py-3">{footer}</div>}
    </div>
  );
}
