import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface TaskDetailsEnhancementRow {
  key: string;
  icon: LucideIcon;
  label: string;
}

interface TaskDetailsEnhancementSectionProps {
  title: string;
  textSize: string;
  fontWeight: string;
  iconSize: string;
  rows: TaskDetailsEnhancementRow[];
}

export function TaskDetailsEnhancementSection({
  title,
  textSize,
  fontWeight,
  iconSize,
  rows,
}: TaskDetailsEnhancementSectionProps) {
  if (rows.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <p className={`${textSize} font-medium text-muted-foreground`}>{title}</p>
      <div className="space-y-1.5">
        {rows.map((row) => {
          const Icon = row.icon;
          return (
            <div
              key={row.key}
              className={`flex items-center gap-2 p-1.5 bg-background/50 rounded border ${textSize}`}
            >
              <Icon className={iconSize} />
              <span className={fontWeight}>{row.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
