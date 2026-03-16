/**
 * Унифицированная форма с секциями
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2 } from 'lucide-react';
import Link from 'next/link';

interface FormSectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

export function FormSection({ title, description, children, className = '' }: FormSectionProps) {
  return (
    <div className={`space-y-4 ${className}`}>
      <div>
        <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
        {description && (
          <p className="text-sm text-gray-500 mt-1">{description}</p>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {children}
      </div>
    </div>
  );
}

interface FormContainerProps {
  title: string;
  subtitle: string;
  backUrl: string;
  submitText: string;
  isPending: boolean;
  children: React.ReactNode;
  action?: (formData: FormData) => void;
}

export function FormContainer({
  title,
  subtitle,
  backUrl,
  submitText,
  isPending,
  children,
  action,
}: FormContainerProps) {
  return (
    <div className="space-y-6">
      {/* Заголовок */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href={backUrl}>
            <ArrowLeft className="w-5 h-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
            {title}
          </h1>
          <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
        </div>
      </div>

      {/* Форма */}
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="text-gray-800">Основная информация</CardTitle>
          <CardDescription className="text-gray-500">
            Заполните все обязательные поля
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={action} className="space-y-6">
            {children}

            {/* Кнопки действий */}
            <div className="flex items-center gap-4 pt-4 border-t">
              <Button
                type="submit"
                disabled={isPending}
                className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5"
              >
                {isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Сохранение...
                  </>
                ) : (
                  submitText
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                asChild
                className="border-gray-200 hover:bg-gray-50"
              >
                <Link href={backUrl}>Отмена</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
