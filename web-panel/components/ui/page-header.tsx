/**
 * Унифицированный заголовок страницы с кнопками действий
 */

import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import Link from 'next/link';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  addButton?: {
    href: string;
    text: string;
  };
  icon?: React.ReactNode;
}

export function PageHeader({ title, subtitle, addButton, icon }: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-8">
      <div className="flex items-center gap-4">
        {icon && (
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg">
            {icon}
          </div>
        )}
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
          )}
        </div>
      </div>
      {addButton && (
        <Link href={addButton.href}>
          <Button className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-lg hover:shadow-xl transition-all duration-200 hover:-translate-y-0.5">
            <Plus className="w-4 h-4 mr-2" />
            {addButton.text}
          </Button>
        </Link>
      )}
    </div>
  );
}
