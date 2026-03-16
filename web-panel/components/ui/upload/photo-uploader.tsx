/**
 * Компонент загрузки фотографий с поддержкой Drag-and-Drop
 * и возможностью изменения порядка фото (сортировка)
 * 
 * Особенности:
 * - Drag-and-Drop зона для загрузки файлов
 * - Предпросмотр загруженных изображений
 * - Возможность перетаскивания фото для изменения порядка
 * - Первое фото в массиве становится обложкой
 * - Валидация количества и типа файлов
 */

'use client';

import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { X, Upload, Image as ImageIcon, GripVertical } from 'lucide-react';

// ============================================
// Типы
// ============================================

interface PhotoFile {
  /** Уникальный идентификатор для React key */
  id: string;
  /** File объект или URL существующего фото */
  src: File | string;
  /** Имя файла */
  name: string;
  /** Является ли это существующим фото из БД */
  isExisting?: boolean;
}

interface PhotoUploaderProps {
  /** Максимальное количество фото */
  maxPhotos?: number;
  /** Существующие фото (для редактирования) */
  existingPhotos?: string[];
  /** Callback при изменении массива фото */
  onChange: (files: (File | string)[]) => void;
  /** Callback при удалении существующего фото (передаёт URL) */
  onExistingPhotoDelete?: (photoUrl: string) => void;
  /** Название сущности для заголовка */
  label?: string;
}

// ============================================
// Компонент
// ============================================

export function PhotoUploader({
  maxPhotos = 10,
  existingPhotos = [],
  onChange,
  onExistingPhotoDelete,
  label = 'Фотографии',
}: PhotoUploaderProps) {
  // ============================================
  // Состояния
  // ============================================
  
  // Массив фото (File объекты для новых + строки URL для существующих)
  const [photos, setPhotos] = useState<PhotoFile[]>(() =>
    existingPhotos.map((url, index) => ({
      id: `existing-${index}-${url}`,
      src: url,
      name: `photo-${index}.jpg`,
      isExisting: true,
    }))
  );

  // Состояние перетаскивания (drag state)
  const [isDragging, setIsDragging] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // Ref для input элемента
  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * Уведомление родителя об изменении массива фото
   * Передаёт массив File объектов и URL строк
   */
  const notifyChange = useCallback(
    (photoList: PhotoFile[]) => {
      onChange(photoList.map((p) => p.src));
    },
    [onChange]
  );

  // ============================================
  // Обработчики
  // ============================================

  /**
   * Обработка выбранных файлов из input
   */
  const handleFileSelect = useCallback(
    (files: FileList | null) => {
      if (!files) return;

      // Проверка лимита количества фото
      const remainingSlots = maxPhotos - photos.length;
      if (remainingSlots <= 0) {
        alert(`Максимум ${maxPhotos} фотографий`);
        return;
      }

      // Конвертация FileList в массив
      const newFiles = Array.from(files).slice(0, remainingSlots);

      // Валидация каждого файла
      const validFiles = newFiles.filter((file) => {
        if (!file.type.startsWith('image/')) {
          alert(`Файл "${file.name}" не является изображением`);
          return false;
        }
        return true;
      });

      // Добавление новых фото в массив
      const newPhotos: PhotoFile[] = validFiles.map((file, index) => ({
        id: `new-${Date.now()}-${index}`,
        src: file,
        name: file.name,
        isExisting: false,
      }));

      const updatedPhotos = [...photos, ...newPhotos];
      setPhotos(updatedPhotos);

      // Уведомление родителя об изменении
      notifyChange(updatedPhotos);
    },
    [photos, maxPhotos, notifyChange]
  );

  /**
   * Удаление фото из массива
   */
  const handleRemovePhoto = useCallback(
    (index: number) => {
      const photoToRemove = photos[index];

      // Если это существующее фото, уведомляем родителя с URL
      if (photoToRemove?.isExisting && typeof photoToRemove.src === 'string' && onExistingPhotoDelete) {
        onExistingPhotoDelete(photoToRemove.src);
      }

      const updatedPhotos = photos.filter((_, i) => i !== index);
      setPhotos(updatedPhotos);
      notifyChange(updatedPhotos);
    },
    [photos, onExistingPhotoDelete, notifyChange]
  );

  // ============================================
  // Drag-and-Drop обработчики для зоны загрузки
  // ============================================

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      handleFileSelect(e.dataTransfer.files);
    },
    [handleFileSelect]
  );

  // ============================================
  // Drag-and-Drop обработчики для сортировки фото
  // ============================================

  const handleDragStart = useCallback(
    (e: React.DragEvent, index: number) => {
      setDraggedIndex(index);
      // Установка прозрачного изображения для drag preview
      e.dataTransfer.effectAllowed = 'move';
    },
    []
  );

  const handleDragOverPhoto = useCallback(
    (e: React.DragEvent, index: number) => {
      e.preventDefault();
      if (draggedIndex === null || draggedIndex === index) return;

      // Перемещение элемента в массиве при перетаскивании
      const newPhotos = [...photos];
      const draggedItem = newPhotos[draggedIndex];

      // Удаление и вставка на новую позицию
      newPhotos.splice(draggedIndex, 1);
      newPhotos.splice(index, 0, draggedItem);

      setPhotos(newPhotos);
      setDraggedIndex(index);
      notifyChange(newPhotos);
    },
    [photos, draggedIndex, notifyChange]
  );

  const handleDragEnd = useCallback(() => {
    setDraggedIndex(null);
  }, []);

  // ============================================
  // Рендер
  // ============================================

  return (
    <div className="space-y-4">
      {/* Заголовок и кнопка добавления */}
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700">
          {label}
          <span className="text-gray-500 text-xs ml-2">
            (макс. {maxPhotos}, первое фото — обложка)
          </span>
        </label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={photos.length >= maxPhotos}
        >
          <Upload className="w-4 h-4 mr-2" />
          Добавить фото
        </Button>
      </div>

      {/* Скрытый input для выбора файлов */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleFileSelect(e.target.files)}
      />

      {/* Drag-and-Drop зона для загрузки */}
      {photos.length < maxPhotos && (
        <Card
          className={`
            border-2 border-dashed p-8 text-center cursor-pointer
            transition-colors duration-200
            ${
              isDragging
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
            }
          `}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="w-10 h-10 mx-auto text-gray-400 mb-2" />
          <p className="text-sm text-gray-600">
            Перетащите фото сюда или кликните для выбора
          </p>
          <p className="text-xs text-gray-500 mt-1">
            PNG, JPG, WebP до 5MB
          </p>
        </Card>
      )}

      {/* Сетка предпросмотра фото */}
      {photos.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {photos.map((photo, index) => (
            <div
              key={photo.id}
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOverPhoto(e, index)}
              onDragEnd={handleDragEnd}
              className={`
                relative group aspect-square rounded-lg overflow-hidden
                border-2 transition-all duration-200
                ${
                  draggedIndex === index
                    ? 'opacity-50 scale-95 border-blue-500'
                    : 'border-gray-200 hover:border-gray-300'
                }
                ${index === 0 ? 'ring-2 ring-green-500 ring-offset-2' : ''}
              `}
            >
              {/* Изображение */}
              <img
                src={
                  typeof photo.src === 'string'
                    ? photo.src
                    : URL.createObjectURL(photo.src)
                }
                alt={photo.name}
                className="w-full h-full object-cover"
                onLoad={(e) => {
                  // Освобождение памяти после загрузки
                  if (typeof photo.src !== 'string') {
                    URL.revokeObjectURL((e.target as HTMLImageElement).src);
                  }
                }}
              />

              {/* Бейдж обложки */}
              {index === 0 && (
                <Badge className="absolute top-1 left-1 bg-green-500 text-white">
                  Обложка
                </Badge>
              )}

              {/* Иконка для перетаскивания */}
              <div className="absolute top-1 right-1 p-1 bg-black/50 rounded cursor-move opacity-0 group-hover:opacity-100 transition-opacity">
                <GripVertical className="w-4 h-4 text-white" />
              </div>

              {/* Кнопка удаления */}
              <button
                type="button"
                onClick={() => handleRemovePhoto(index)}
                className="absolute bottom-1 right-1 p-1 bg-red-500 rounded-full
                         text-white opacity-0 group-hover:opacity-100
                         transition-opacity hover:bg-red-600"
              >
                <X className="w-3 h-3" />
              </button>

              {/* Индикатор существующего фото */}
              {photo.isExisting && (
                <Badge
                  variant="secondary"
                  className="absolute bottom-1 left-1 text-xs"
                >
                  Существующее
                </Badge>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Счётчик фото */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <ImageIcon className="w-4 h-4" />
        <span>
          Загружено {photos.length} из {maxPhotos}
        </span>
      </div>
    </div>
  );
}
