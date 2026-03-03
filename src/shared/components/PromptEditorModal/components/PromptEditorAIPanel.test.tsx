import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PromptEditorAIPanel } from './PromptEditorAIPanel';

const mocks = vi.hoisted(() => ({
  PromptGenerationControls: vi.fn(() => <div data-testid="prompt-generation-controls" />),
  BulkEditControls: vi.fn(() => <div data-testid="bulk-edit-controls" />),
}));

vi.mock('@/shared/components/ui/button', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock('@/shared/components/ui/collapsible', () => ({
  Collapsible: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CollapsibleTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  CollapsibleContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/shared/components/ui/tabs', () => {
  const ReactLocal = require('react') as typeof React;
  const TabsContext = ReactLocal.createContext<{
    value: string;
    onValueChange: (value: string) => void;
  } | null>(null);

  return {
    Tabs: ({
      value,
      onValueChange,
      children,
    }: {
      value: string;
      onValueChange: (value: string) => void;
      children: React.ReactNode;
    }) => (
      <TabsContext.Provider value={{ value, onValueChange }}>
        <div>{children}</div>
      </TabsContext.Provider>
    ),
    TabsList: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    TabsTrigger: ({
      value,
      children,
    }: {
      value: string;
      children: React.ReactNode;
    }) => {
      const ctx = ReactLocal.useContext(TabsContext)!;
      return <button onClick={() => ctx.onValueChange(value)}>{children}</button>;
    },
    TabsContent: ({
      value,
      children,
    }: {
      value: string;
      children: React.ReactNode;
    }) => {
      const ctx = ReactLocal.useContext(TabsContext)!;
      return ctx.value === value ? <div>{children}</div> : null;
    },
  };
});

vi.mock('@/shared/components/PromptGenerationControls', () => ({
  PromptGenerationControls: (props: unknown) => mocks.PromptGenerationControls(props),
}));

vi.mock('@/shared/components/PromptEditorModal/BulkEditControls', () => ({
  BulkEditControls: (props: unknown) => mocks.BulkEditControls(props),
}));

describe('PromptEditorAIPanel', () => {
  function buildProps(
    overrides: Partial<React.ComponentProps<typeof PromptEditorAIPanel>> = {},
  ): React.ComponentProps<typeof PromptEditorAIPanel> {
    return {
      isMobile: false,
      expanded: true,
      onExpandedChange: vi.fn(),
      onToggle: vi.fn(),
      onTouchStart: vi.fn(),
      activeTab: 'generate',
      onActiveTabChange: vi.fn(),
      prompts: [
        { id: 'p1', fullPrompt: 'full one', shortPrompt: 'short one' },
        { id: 'p2', fullPrompt: 'full two', shortPrompt: 'short two' },
      ] as never,
      generation: {
        onGenerate: vi.fn(async () => {}),
        onGenerateAndQueue: vi.fn(async () => {}),
        isGenerating: false,
        values: { promptCount: 2 } as never,
        onValuesChange: vi.fn(),
      },
      bulkEdit: {
        onBulkEdit: vi.fn(async () => {}),
        isEditing: false,
        values: { operation: 'append' } as never,
        onValuesChange: vi.fn(),
      },
      ...overrides,
    };
  }

  it('renders generate controls with prompt context', () => {
    render(<PromptEditorAIPanel {...buildProps({ activeTab: 'generate' })} />);

    expect(screen.getByTestId('prompt-generation-controls')).toBeInTheDocument();
    expect(mocks.PromptGenerationControls).toHaveBeenCalledWith(
      expect.objectContaining({
        hasApiKey: true,
        existingPromptsForContext: [
          { id: 'p1', text: 'full one', shortText: 'short one', hidden: false },
          { id: 'p2', text: 'full two', shortText: 'short two', hidden: false },
        ],
      }),
    );
  });

  it('renders remix mode controls when remix tab is active', () => {
    render(<PromptEditorAIPanel {...buildProps({ activeTab: 'remix' })} />);

    expect(screen.getByTestId('prompt-generation-controls')).toBeInTheDocument();
    expect(mocks.PromptGenerationControls).toHaveBeenCalledWith(
      expect.objectContaining({
        remixMode: true,
      }),
    );
  });

  it('renders bulk edit controls with prompt count', () => {
    render(<PromptEditorAIPanel {...buildProps({ activeTab: 'bulk-edit' })} />);

    expect(screen.getByTestId('bulk-edit-controls')).toBeInTheDocument();
    expect(mocks.BulkEditControls).toHaveBeenCalledWith(
      expect.objectContaining({
        numberOfPromptsToEdit: 2,
      }),
    );
  });

  it('wires toggle/touch handlers and tab selection callbacks', () => {
    const onToggle = vi.fn();
    const onTouchStart = vi.fn();
    const onActiveTabChange = vi.fn();
    render(
      <PromptEditorAIPanel
        {...buildProps({
          expanded: false,
          onToggle,
          onTouchStart,
          onActiveTabChange,
        })}
      />,
    );

    fireEvent.touchStart(screen.getByRole('button', { name: /AI Prompt Tools/i }));
    fireEvent.click(screen.getByRole('button', { name: /AI Prompt Tools/i }));
    fireEvent.click(screen.getByRole('button', { name: /Remix/i }));

    expect(onTouchStart).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onActiveTabChange).toHaveBeenCalledWith('remix');
  });
});
