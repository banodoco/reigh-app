import React, { useState } from 'react';
import {
  Plus,
  Download,
  Edit3,
  Trash2
} from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/shared/components/ui/dialog';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Textarea } from '@/shared/components/ui/textarea';
import { TrainingDataBatch, TrainingDataVideo, TrainingDataSegment } from '../hooks/useTrainingData';
import { useUpdatingTimestamp } from '@/shared/hooks/useUpdatingTimestamp';
import { handleError } from '@/shared/lib/errorHandling/handleError';
import { useBatchDownload } from '../hooks/useBatchDownload';

interface BatchSelectorProps {
  batches: TrainingDataBatch[];
  selectedBatchId: string | null;
  onSelectBatch: (batchId: string) => void;
  onCreateBatch: (name: string, description?: string) => Promise<string>;
  onUpdateBatch: (id: string, updates: { name?: string; description?: string }) => Promise<void>;
  onDeleteBatch: (id: string) => Promise<void>;
  videos: TrainingDataVideo[];
  segments: TrainingDataSegment[];
  getVideoUrl: (video: TrainingDataVideo) => string;
}

// Add abbreviateDistance function
const abbreviateDistance = (str: string) => {
  return str
    .replace(/about\s+/g, '')
    .replace(/\s+minutes?\s+/g, ' mins ')
    .replace(/\s+hours?\s+/g, ' hrs ')
    .replace(/\s+days?\s+/g, ' days ')
    .replace(/\s+months?\s+/g, ' mos ')
    .replace(/\s+years?\s+/g, ' yrs ')
    .replace(/less than a minute/g, '<1 min');
};

// Component for live-updating batch created timestamp
const BatchCreatedTimestamp: React.FC<{ createdAt: string }> = ({ createdAt }) => {
  const timeAgo = useUpdatingTimestamp({
    date: createdAt,
    abbreviate: abbreviateDistance
  });

  return <>Created {timeAgo}</>;
};

// ============================================================================
// CreateBatchDialog — reusable dialog for creating a new batch
// ============================================================================

interface CreateBatchDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateBatch: (name: string, description?: string) => Promise<string>;
  trigger?: React.ReactNode;
}

function CreateBatchDialog({ isOpen, onOpenChange, onCreateBatch, trigger }: CreateBatchDialogProps) {
  const [newBatchName, setNewBatchName] = useState('');
  const [newBatchDescription, setNewBatchDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateBatch = async () => {
    if (!newBatchName.trim()) return;

    setIsCreating(true);
    try {
      await onCreateBatch(newBatchName.trim(), newBatchDescription.trim() || undefined);
      setNewBatchName('');
      setNewBatchDescription('');
      onOpenChange(false);
    } catch (error) {
      handleError(error, { context: 'BatchSelector', showToast: false });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Batch</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="batch-name">Batch Name</Label>
            <Input
              id="batch-name"
              value={newBatchName}
              onChange={(e) => setNewBatchName(e.target.value)}
              placeholder="Enter batch name..."
            />
          </div>

          <div>
            <Label htmlFor="batch-description">Description (optional)</Label>
            <Textarea
              id="batch-description"
              value={newBatchDescription}
              onChange={(e) => setNewBatchDescription(e.target.value)}
              placeholder="Describe this batch..."
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isCreating}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateBatch}
              disabled={!newBatchName.trim() || isCreating}
            >
              {isCreating ? 'Creating...' : 'Create Batch'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// BatchSelector — main component
// ============================================================================

export function BatchSelector({ batches, selectedBatchId, onSelectBatch, onCreateBatch, onUpdateBatch, onDeleteBatch, videos, segments, getVideoUrl }: BatchSelectorProps) {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingBatch, setEditingBatch] = useState<TrainingDataBatch | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [batchToDelete, setBatchToDelete] = useState<TrainingDataBatch | null>(null);

  const { isDownloading, handlePrepareDownload } = useBatchDownload({
    batches,
    videos,
    segments,
    selectedBatchId,
    getVideoUrl,
  });

  const handleEditBatch = (batch: TrainingDataBatch) => {
    setEditingBatch(batch);
    setEditName(batch.name);
    setEditDescription(batch.description || '');
  };

  const handleUpdateBatch = async () => {
    if (!editingBatch || !editName.trim()) return;

    setIsUpdating(true);
    try {
      await onUpdateBatch(editingBatch.id, {
        name: editName.trim(),
        description: editDescription.trim() || undefined,
      });
      setEditingBatch(null);
      setEditName('');
      setEditDescription('');
    } catch (error) {
      handleError(error, { context: 'BatchSelector', showToast: false });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteBatch = async () => {
    if (!batchToDelete) return;

    try {
      await onDeleteBatch(batchToDelete.id);
      setIsDeleteDialogOpen(false);
      setBatchToDelete(null);
    } catch (error) {
      handleError(error, { context: 'BatchSelector', showToast: false });
    }
  };

  const openDeleteDialog = (batch: TrainingDataBatch) => {
    setBatchToDelete(batch);
    setIsDeleteDialogOpen(true);
  };

  const selectedBatch = batches.find(b => b.id === selectedBatchId);

  const newBatchButton = (
    <Button variant="outline" className="flex items-center gap-1">
      <Plus className="h-4 w-4" />
      New Batch
    </Button>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Training Data Batches</CardTitle>
      </CardHeader>
      <CardContent>
        {/* If no batch is selected, only show the New Batch button */}
        {!selectedBatchId ? (
          <div className="text-center py-8">
            <CreateBatchDialog
              isOpen={isCreateDialogOpen}
              onOpenChange={setIsCreateDialogOpen}
              onCreateBatch={onCreateBatch}
              trigger={newBatchButton}
            />
          </div>
        ) : (
          /* Show full interface when a batch is selected */
          <>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <Select value={selectedBatchId} onValueChange={onSelectBatch}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a batch..." />
                  </SelectTrigger>
                  <SelectContent>
                    {batches.map((batch) => (
                      <SelectItem key={batch.id} value={batch.id} className="preserve-case">
                        {batch.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <CreateBatchDialog
                isOpen={isCreateDialogOpen}
                onOpenChange={setIsCreateDialogOpen}
                onCreateBatch={onCreateBatch}
                trigger={newBatchButton}
              />
            </div>

            {selectedBatch && (
              <div className="mt-3 p-3 bg-muted rounded-lg">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-light text-sm preserve-case">{selectedBatch.name}</h4>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEditBatch(selectedBatch)}
                        className="h-6 w-6 p-0"
                      >
                        <Edit3 className="h-3 w-3" />
                      </Button>
                    </div>
                    {selectedBatch.description && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {selectedBatch.description}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-2">
                      <BatchCreatedTimestamp createdAt={selectedBatch.createdAt} />
                    </p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span>{videos.filter(v => v.batchId === selectedBatchId).length} videos</span>
                      <span>{segments.filter(s => videos.some(v => v.id === s.trainingDataId && v.batchId === selectedBatchId)).length} segments</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 ml-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handlePrepareDownload}
                      disabled={isDownloading}
                      className="flex items-center gap-1"
                    >
                      <Download className="h-4 w-4" />
                      {isDownloading ? 'Preparing...' : 'Prepare Download'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openDeleteDialog(selectedBatch)}
                      className="flex items-center gap-1 text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete Batch
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Edit Batch Dialog */}
        <Dialog open={editingBatch !== null} onOpenChange={(open) => !open && setEditingBatch(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Batch</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="edit-batch-name">Batch Name</Label>
                <Input
                  id="edit-batch-name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Enter batch name..."
                />
              </div>

              <div>
                <Label htmlFor="edit-batch-description">Description (optional)</Label>
                <Textarea
                  id="edit-batch-description"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Describe this batch..."
                  rows={3}
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setEditingBatch(null)}
                  disabled={isUpdating}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleUpdateBatch}
                  disabled={!editName.trim() || isUpdating}
                >
                  {isUpdating ? 'Updating...' : 'Update Batch'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete Batch Confirmation Dialog */}
        <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Batch</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Are you sure you want to delete "<span className="preserve-case">{batchToDelete?.name}</span>"? This action cannot be undone.
              </p>
              {batchToDelete && videos.filter(v => v.batchId === batchToDelete.id).length > 0 && (
                <p className="text-sm text-red-600 font-light">
                  This batch contains {videos.filter(v => v.batchId === batchToDelete.id).length} videos.
                  Please delete all videos first before deleting the batch.
                </p>
              )}

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setIsDeleteDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDeleteBatch}
                  disabled={batchToDelete ? videos.filter(v => v.batchId === batchToDelete.id).length > 0 : false}
                >
                  Delete Batch
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
