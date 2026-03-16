/**
 * Унифицированная карточка статистики
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

interface StatCardProps {
  title: string;
  value: number;
  description: string;
  icon: React.ElementType;
  gradient: string;
  href?: string;
}

export function StatCard({
  title,
  value,
  description,
  icon: Icon,
  gradient,
  href,
}: StatCardProps) {
  const card = (
    <Card className="group relative overflow-hidden border-0 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
      <div
        className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-0 group-hover:opacity-5 transition-opacity duration-300`}
      />

      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-gray-600">
          {title}
        </CardTitle>
        <div
          className={`w-12 h-12 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center shadow-md group-hover:scale-110 transition-transform duration-300`}
        >
          <Icon className="w-6 h-6 text-white" />
        </div>
      </CardHeader>

      <CardContent>
        <div className="space-y-2">
          <div
            className={`text-4xl font-bold bg-gradient-to-r ${gradient} bg-clip-text text-transparent`}
          >
            {value.toLocaleString('ru-RU')}
          </div>
          <p className="text-xs text-gray-500">{description}</p>
        </div>

        {href && (
          <Link href={href}>
            <Button
              variant="ghost"
              className={`w-full justify-between mt-4 ${gradient.includes('blue') ? 'text-blue-600 hover:bg-blue-50' : gradient.includes('purple') ? 'text-purple-600 hover:bg-purple-50' : gradient.includes('emerald') ? 'text-emerald-600 hover:bg-emerald-50' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              <span className="text-sm font-medium">Подробнее</span>
              <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        )}
      </CardContent>
    </Card>
  );

  return card;
}
