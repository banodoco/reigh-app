import { toast } from '@/shared/components/ui/toast';
import { installErrorNotifier } from '@/shared/lib/errorHandling/errorNotifier';

let presenterInstalled = false;
const ERROR_NOTIFIER_OWNER = 'app-bootstrap';

export function registerToastErrorPresenter(): void {
  if (presenterInstalled) {
    return;
  }

  installErrorNotifier(({ title, description }) => {
    toast({
      title,
      description,
      variant: 'destructive',
    });
  }, ERROR_NOTIFIER_OWNER);
  presenterInstalled = true;
}
