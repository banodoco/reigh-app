import { describe, it, expect } from 'vitest';
import { AlertDialog, AlertDialogPortal, AlertDialogOverlay, AlertDialogTrigger, AlertDialogContent } from '../alert-dialog';

describe('alert-dialog', () => {
  it('exports expected members', () => {
    expect(AlertDialog).toBeDefined();
    expect(AlertDialogPortal).toBeDefined();
    expect(AlertDialogOverlay).toBeDefined();
    expect(AlertDialogTrigger).toBeDefined();
    expect(AlertDialogContent).toBeDefined();
  });
});
