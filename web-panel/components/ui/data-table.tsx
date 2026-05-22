import fs from 'fs';
import path from 'path';
import Link from 'next/link';
import Image from 'next/image';
import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface Column {
  key: string;
  label: string;
  className?: string;
  sortable?: boolean;
  renderHeader?: (column: Column) => React.ReactNode;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column[];
  emptyMessage: string;
  imageField?: string;
  editUrl?: (item: T) => string;
  renderActions?: (item: T) => React.ReactNode;
  renderCell?: (item: T, key: string) => React.ReactNode;
  sortParams?: {
    currentSort: string;
    params: Record<string, string | string[] | undefined>;
    renderSortLink: (column: Column) => React.ReactNode;
  };
}

const publicUploadsPath = path.join(process.cwd(), 'public', 'uploads');

function getExistingPublicPhoto(src: string | null | undefined) {
  if (!src) {
    return null;
  }

  try {
    const url = new URL(src, 'http://local.invalid');
    const pathname = decodeURIComponent(url.pathname);

    if (!pathname.startsWith('/uploads/')) {
      return src;
    }

    const localPath = path.join(process.cwd(), 'public', pathname);

    if (!localPath.startsWith(publicUploadsPath) || !fs.existsSync(localPath)) {
      return null;
    }

    return pathname;
  } catch {
    return src;
  }
}

export function DataTable<T extends { id: string; name: string; photos?: string[] | null }>({
  data,
  columns,
  emptyMessage,
  imageField,
  editUrl,
  renderActions,
  renderCell,
}: DataTableProps<T>) {
  const hasActions = !!editUrl || !!renderActions;

  return (
    <Card className="overflow-hidden border border-gray-200 shadow-sm">
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="border-b-2 border-slate-200 bg-gradient-to-r from-slate-50 to-gray-50">
              {imageField && (
                <TableHead className="w-20 text-center font-semibold text-gray-700">
                  Фото
                </TableHead>
              )}
              {columns.map((column) => (
                <TableHead
                  key={column.key}
                  className={`font-semibold text-gray-700 ${column.className || ''} ${
                    column.sortable ? 'cursor-pointer hover:text-blue-600' : ''
                  }`}
                >
                  {column.renderHeader ? column.renderHeader(column) : column.label}
                </TableHead>
              ))}
              {hasActions && (
                <TableHead className="w-32 text-center font-semibold text-gray-700">
                  Действия
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length + (imageField ? 1 : 0) + (hasActions ? 1 : 0)}
                  className="py-12 text-center text-gray-500"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              data.map((item, index) => {
                const photoSrc = getExistingPublicPhoto(item.photos?.[0]);

                return (
                  <TableRow
                    key={item.id}
                    className={`transition-colors duration-150 hover:bg-gradient-to-r hover:from-blue-50/50 hover:to-indigo-50/50 ${
                      index % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'
                    }`}
                  >
                    {imageField && (
                      <TableCell className="text-center">
                        {photoSrc ? (
                          <Image
                            src={photoSrc}
                            alt={item.name}
                            width={48}
                            height={48}
                            unoptimized
                            className="mx-auto h-12 w-12 rounded-lg object-cover shadow-md"
                          />
                        ) : (
                          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br from-gray-100 to-gray-200">
                            <span className="text-xs text-gray-400">Нет</span>
                          </div>
                        )}
                      </TableCell>
                    )}
                    {columns.map((column) => (
                      <TableCell key={column.key} className="align-middle">
                        {renderCell ? renderCell(item, column.key) : String(item[column.key as keyof T] ?? '')}
                      </TableCell>
                    ))}
                    {hasActions && (
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          {editUrl && (
                            <Button
                              variant="ghost"
                              size="icon"
                              asChild
                              className="transition-colors hover:bg-blue-100 hover:text-blue-600"
                            >
                              <Link href={editUrl(item)} aria-label={`Редактировать ${item.name}`}>
                                <Pencil className="h-4 w-4" aria-hidden="true" />
                              </Link>
                            </Button>
                          )}
                          {renderActions?.(item)}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
