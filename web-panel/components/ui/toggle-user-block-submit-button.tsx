'use client';

import { useFormStatus } from 'react-dom';
import { Ban, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ToggleUserBlockSubmitButtonProps {
  isBlocked: boolean;
  confirmMessage: string;
}

export function ToggleUserBlockSubmitButton({
  isBlocked,
  confirmMessage,
}: ToggleUserBlockSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      variant="ghost"
      size="icon"
      className={`transition-colors ${
        isBlocked
          ? 'hover:bg-emerald-100 hover:text-emerald-600'
          : 'hover:bg-amber-100 hover:text-amber-700'
      }`}
      disabled={pending}
      title={isBlocked ? 'Разблокировать' : 'Заблокировать'}
      onClick={(event) => {
        if (!window.confirm(confirmMessage)) {
          event.preventDefault();
        }
      }}
    >
      {isBlocked ? <RotateCcw className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
    </Button>
  );
}
