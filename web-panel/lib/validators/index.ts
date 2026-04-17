import { z } from 'zod';
import { finishingEnum } from '@/lib/db/schema';

export const FINISHING_TYPES = finishingEnum.enumValues;
export const FINISHING_OPTIONS = [
  { value: 'Чистовая', label: 'Чистовая' },
  { value: 'Вайт бокс', label: 'Подчистовая' },
  { value: 'Без отделки', label: 'Без отделки' },
] as const;
export const USER_ROLES = ['admin', 'moderator'] as const;

export function formatFinishingLabel(value: string) {
  return FINISHING_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

function normalizeIntegerMoney(value: unknown) {
  if (typeof value === 'string') {
    const digitsOnly = value.replace(/[^\d]/g, '');
    return digitsOnly === '' ? undefined : Number.parseInt(digitsOnly, 10);
  }

  return value;
}

export const citySchema = z.object({
  name: z
    .string()
    .min(2, 'Название должно содержать минимум 2 символа')
    .max(100, 'Название не должно превышать 100 символов')
    .trim(),
  description: z
    .string()
    .max(2000, 'Описание не должно превышать 2000 символов')
    .optional()
    .or(z.literal('')),
});

export const createCitySchema = citySchema;
export const updateCitySchema = citySchema.partial();

export const districtSchema = z.object({
  cityId: z.string().uuid('Некорректный ID города'),
  name: z
    .string()
    .min(2, 'Название должно содержать минимум 2 символа')
    .max(100, 'Название не должно превышать 100 символов')
    .trim(),
  description: z
    .string()
    .max(2000, 'Описание не должно превышать 2000 символов')
    .optional()
    .or(z.literal('')),
  photos: z
    .array(z.string().url('Некорректный URL фотографии'))
    .max(3, 'Максимум 3 фотографии')
    .optional()
    .default([]),
});

export const createDistrictSchema = districtSchema;
export const updateDistrictSchema = districtSchema.partial();

export const apartmentSchema = z.object({
  districtId: z.string().uuid('Некорректный ID района'),
  name: z
    .string()
    .min(2, 'Название должно содержать минимум 2 символа')
    .max(200, 'Название не должно превышать 200 символов')
    .trim(),
  finishing: z.enum(FINISHING_TYPES, {
    message: 'Выберите корректный тип отделки',
  }),
  rooms: z
    .string()
    .min(1, 'Укажите количество комнат')
    .max(10, 'Слишком длинное значение'),
  area: z
    .coerce.number()
    .positive('Площадь должна быть больше 0')
    .max(1000, 'Площадь не может превышать 1000 м²'),
  price: z.preprocess(
    normalizeIntegerMoney,
    z
      .number({
        message: 'Укажите цену квартиры',
      })
      .int('Цена должна быть указана в целых рублях')
      .positive('Цена должна быть больше 0')
      .max(1_000_000_000, 'Слишком высокая цена')
  ),
  photos: z
    .array(z.string().url('Некорректный URL фотографии'))
    .max(10, 'Максимум 10 фотографий')
    .optional()
    .default([]),
});

export const createApartmentSchema = apartmentSchema;
export const updateApartmentSchema = apartmentSchema.partial();

export const loginSchema = z.object({
  login: z.string().min(1, 'Введите логин'),
  password: z.string().min(1, 'Введите пароль'),
});

export const createUserSchema = z.object({
  login: z
    .string()
    .min(3, 'Логин должен содержать минимум 3 символа')
    .max(100, 'Логин не должен превышать 100 символов')
    .regex(/^[a-zA-Z0-9._-]+$/, 'Используйте только латиницу, цифры, точку, дефис и подчёркивание')
    .trim(),
  password: z
    .string()
    .min(8, 'Пароль должен содержать минимум 8 символов')
    .max(128, 'Пароль не должен превышать 128 символов'),
});

export const updateUserSchema = z.object({
  login: z
    .string()
    .min(3, 'Логин должен содержать минимум 3 символа')
    .max(100, 'Логин не должен превышать 100 символов')
    .regex(/^[a-zA-Z0-9._-]+$/, 'Используйте только латиницу, цифры, точку, дефис и подчёркивание')
    .trim(),
  password: z
    .string()
    .max(128, 'Пароль не должен превышать 128 символов')
    .optional()
    .or(z.literal(''))
    .refine((value) => !value || value.length >= 8, {
      message: 'Пароль должен содержать минимум 8 символов',
    }),
});

export const forcePasswordChangeSchema = z
  .object({
    password: z
      .string()
      .min(8, 'Новый пароль должен содержать минимум 8 символов')
      .max(128, 'Новый пароль не должен превышать 128 символов'),
    confirmPassword: z
      .string()
      .min(8, 'Подтвердите новый пароль')
      .max(128, 'Подтверждение пароля не должно превышать 128 символов'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Пароли не совпадают',
    path: ['confirmPassword'],
  });

export type CityFormData = z.infer<typeof createCitySchema>;
export type DistrictFormData = z.infer<typeof createDistrictSchema>;
export type ApartmentFormData = z.infer<typeof createApartmentSchema>;
export type LoginFormData = z.infer<typeof loginSchema>;
export type CreateUserFormData = z.infer<typeof createUserSchema>;
export type UpdateUserFormData = z.infer<typeof updateUserSchema>;
export type ForcePasswordChangeFormData = z.infer<typeof forcePasswordChangeSchema>;
