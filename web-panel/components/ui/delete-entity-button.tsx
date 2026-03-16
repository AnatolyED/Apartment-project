import { ConfirmDeleteSubmitButton } from '@/components/ui/confirm-delete-submit-button';

interface DeleteEntityButtonProps {
  action: () => Promise<void>;
  confirmMessage: string;
}

export function DeleteEntityButton({
  action,
  confirmMessage,
}: DeleteEntityButtonProps) {
  return (
    <form action={action}>
      <ConfirmDeleteSubmitButton confirmMessage={confirmMessage} />
    </form>
  );
}
