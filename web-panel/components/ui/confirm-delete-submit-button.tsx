'use client';

import { useFormStatus } from 'react-dom';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ConfirmDeleteSubmitButtonProps {
  confirmMessage: string;
}

export function ConfirmDeleteSubmitButton({
  confirmMessage,
}: ConfirmDeleteSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      variant="ghost"
      size="icon"
      className="transition-colors hover:bg-red-100 hover:text-red-600"
      disabled={pending}
      title="Удалить"
      onClick={(event) => {
        if (!window.confirm(confirmMessage)) {
          event.preventDefault();
        }
      }}
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  );
}
