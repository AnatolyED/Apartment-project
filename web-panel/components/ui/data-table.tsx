import Link from 'next/link';
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
    params: any;
    renderSortLink: (column: Column) => React.ReactNode;
  };
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
    <Card className="overflow-hidden border-0 shadow-lg">
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
              data.map((item, index) => (
                <TableRow
                  key={item.id}
                  className={`transition-colors duration-150 hover:bg-gradient-to-r hover:from-blue-50/50 hover:to-indigo-50/50 ${
                    index % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'
                  }`}
                >
                  {imageField && (
                    <TableCell className="text-center">
                      {item.photos?.[0] ? (
                        <img
                          src={item.photos[0]}
                          alt={item.name}
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
                      {renderCell ? renderCell(item, column.key) : (item as any)[column.key]}
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
                            <Link href={editUrl(item)}>
                              <Pencil className="h-4 w-4" />
                            </Link>
                          </Button>
                        )}
                        {renderActions?.(item)}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
