import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/shared/components/ui/dialog";
import { ScrollArea } from "@/shared/components/ui/scroll-area";
import { DescriptionModalProps } from '../types';

export const DescriptionModal: React.FC<DescriptionModalProps> = ({
  open,
  onOpenChange,
  title,
  description
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-lg font-light">{title}</DialogTitle>
          <DialogDescription>Full description</DialogDescription>
        </DialogHeader>
        <ScrollArea className="flex-1 pr-4 overflow-y-auto">
          <div className="py-4">
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {description}
            </p>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
