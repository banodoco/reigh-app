import { useState } from 'react';
import { ChevronDown, ChevronRight, Terminal } from 'lucide-react';
import { cn } from '@/shared/components/ui/contracts/cn';
import type { AgentTurn } from '@/tools/video-editor/types/agent-session';
import type { ToolCallPair } from './AgentChat';

const MAX_TOOL_NAME_LENGTH = 80;
const MAX_ATTACHMENT_SUMMARY_LENGTH = 120;
const MAX_ATTACHMENT_PREVIEW_COUNT = 4;

type AgentChatMessageProps = {
  turn: AgentTurn;
};

type AgentChatToolGroupProps = {
  pairs: ToolCallPair[];
};

function formatAttachmentSummary(attachments: AgentTurn['attachments']) {
  if (!attachments?.length) {
    return null;
  }

  const imageCount = attachments.filter((attachment) => attachment.mediaType === 'image').length;
  const videoCount = attachments.length - imageCount;
  const parts = [
    imageCount > 0 ? `${imageCount} image${imageCount === 1 ? '' : 's'}` : null,
    videoCount > 0 ? `${videoCount} video${videoCount === 1 ? '' : 's'}` : null,
  ].filter((part): part is string => part !== null);

  if (parts.length === 0) {
    return null;
  }

  return `${parts.join(', ')} attached`;
}

function formatTimestamp(timestamp: string) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

type AgentChatAttachmentStripProps = {
  attachments: NonNullable<AgentTurn['attachments']>;
  isUser: boolean;
};

function AgentChatAttachmentStrip({ attachments, isUser }: AgentChatAttachmentStripProps) {
  const previewAttachments = attachments.slice(0, MAX_ATTACHMENT_PREVIEW_COUNT);
  const remainingCount = attachments.length - previewAttachments.length;

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {previewAttachments.map((attachment, index) => (
        <div
          key={`${attachment.clipId}:${index}`}
          className={cn(
            'relative h-10 w-10 overflow-hidden rounded-md border',
            isUser
              ? 'border-primary-foreground/20 bg-primary-foreground/10'
              : 'border-border/70 bg-muted/40',
          )}
        >
          {attachment.mediaType === 'video' ? (
            <video
              src={attachment.url}
              className="h-full w-full object-cover"
              muted
              playsInline
              preload="metadata"
              aria-label="Attached video preview"
            />
          ) : (
            <img
              src={attachment.url}
              alt="Attached image preview"
              className="h-full w-full object-cover"
              loading="lazy"
            />
          )}
        </div>
      ))}
      {remainingCount > 0 && (
        <div
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-md border text-[10px] font-medium',
            isUser
              ? 'border-primary-foreground/20 bg-primary-foreground/10 text-primary-foreground/80'
              : 'border-border/70 bg-muted/40 text-muted-foreground',
          )}
          aria-label={`${remainingCount} more attachments`}
        >
          +{remainingCount}
        </div>
      )}
    </div>
  );
}

export function AgentChatToolGroup({ pairs }: AgentChatToolGroupProps) {
  const [isOpen, setIsOpen] = useState(false);
  const count = pairs.length;

  // For run commands, show the command string directly
  const commandSummaries = pairs.map((p) => {
    const command = p.call.tool_args?.command;
    return typeof command === 'string' ? command : (p.call.content ?? p.call.tool_name ?? 'tool');
  });

  const label = count === 1
    ? commandSummaries[0]
    : `${count} commands`;

  return (
    <div className="w-full">
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded-lg bg-muted/30 px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-muted/50"
        onClick={() => setIsOpen(!isOpen)}
      >
        <Terminal className="h-3 w-3 shrink-0 text-muted-foreground" />
        <code className="flex-1 truncate font-mono text-foreground/80">{label}</code>
        {count > 1 && (isOpen ? <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />)}
      </button>

      {isOpen && count > 1 && (
        <div className="mt-1 space-y-0.5 pl-2">
          {pairs.map((pair, index) => (
            <div key={`${pair.call.timestamp}:${index}`} className="flex items-start gap-2 rounded px-2 py-1 text-xs">
              <code className="font-mono text-foreground/70">{commandSummaries[index]}</code>
              {pair.result && (
                <span className="truncate text-muted-foreground">→ {pair.result.content?.slice(0, MAX_TOOL_NAME_LENGTH)}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Show result inline for single commands */}
      {count === 1 && pairs[0].result?.content && (
        <div className="mt-0.5 px-2.5 text-xs text-muted-foreground">
          {pairs[0].result.content.slice(0, MAX_ATTACHMENT_SUMMARY_LENGTH)}
        </div>
      )}
    </div>
  );
}

export function AgentChatMessage({ turn }: AgentChatMessageProps) {
  const timestamp = formatTimestamp(turn.timestamp);
  const isUser = turn.role === 'user';
  const attachmentSummary = formatAttachmentSummary(turn.attachments);
  const hasAttachmentPreviews = Boolean(turn.attachments?.length);

  return (
    <div className={cn('flex w-full', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-4 py-2.5 shadow-sm',
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'border border-border/70 bg-card text-card-foreground',
        )}
      >
        <div className="whitespace-pre-wrap text-sm leading-relaxed">{turn.content}</div>
        {hasAttachmentPreviews && turn.attachments && (
          <AgentChatAttachmentStrip attachments={turn.attachments} isUser={isUser} />
        )}
        {attachmentSummary && (
          <span
            className={cn(
              'mt-1.5 block text-xs',
              isUser ? 'text-primary-foreground/75' : 'text-muted-foreground',
            )}
          >
            {attachmentSummary}
          </span>
        )}
        {timestamp && (
          <div
            className={cn(
              'mt-1.5 text-[10px] uppercase tracking-[0.14em]',
              isUser ? 'text-primary-foreground/70' : 'text-muted-foreground',
            )}
          >
            {timestamp}
          </div>
        )}
      </div>
    </div>
  );
}
