# Web-панель управления недвижимостью

Современная панель администратора для управления объектами недвижимости (районы и квартиры).

## 🚀 Быстрый старт

### 1. Установка зависимостей

```bash
npm install
```

### 2. Настройка переменных окружения

Создайте файл `.env` в корне проекта на основе `.env.example`:

```bash
# База данных PostgreSQL
DATABASE_URL=postgresql://postgres:password@localhost:5432/realty_db

# Авторизация
ADMIN_LOGIN=admin
ADMIN_PASSWORD=changeme123

# Секрет для сессий (сгенерируйте случайную строку)
SESSION_SECRET=your-super-secret-session-key-change-this-in-production

# URL приложения
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. Запуск базы данных

Убедитесь, что PostgreSQL запущен и создана база данных:

```sql
CREATE DATABASE realty_db;
```

### 4. Применение миграций

```bash
# Генерация миграций на основе schema.ts
npx drizzle-kit generate

# Применение миграций к базе данных
npx drizzle-kit migrate
```

### 5. Запуск приложения

```bash
# Режим разработки (Turbopack)
npm run dev

# Production сборка
npm run build
npm start
```

Приложение будет доступно по адресу: http://localhost:3000

---

## 📁 Структура проекта

```
web-panel/
├── app/
│   ├── (auth)/
│   │   └── login/              # Страница входа
│   ├── (dashboard)/
│   │   ├── apartments/         # Управление квартирами
│   │   │   ├── new/            # Создание квартиры
│   │   │   └── [id]/edit/      # Редактирование квартиры
│   │   ├── districts/          # Управление районами
│   │   │   └── new/            # Создание района
│   │   ├── layout.tsx          # Layout панели (sidebar)
│   │   └── page.tsx            # Главная страница (дашборд)
│   ├── uploads/                # Локальное хранилище файлов
│   └── globals.css
├── components/
│   ├── forms/                  # Формы для сущностей
│   ├── tables/                 # Таблицы данных
│   └── ui/
│       ├── upload/
│       │   └── photo-uploader.tsx  # Загрузка фото с DnD
│       └── ...                 # shadcn/ui компоненты
├── lib/
│   ├── auth/
│   │   ├── actions.ts          # Server Actions авторизации
│   │   └── session.ts          # Управление сессиями
│   ├── apartments/
│   │   └── actions.ts          # CRUD для квартир
│   ├── districts/
│   │   └── actions.ts          # CRUD для районов
│   ├── db/
│   │   ├── index.ts            # Подключение к БД
│   │   └── schema.ts           # Drizzle схема
│   ├── storage/
│   │   └── index.ts            # Работа с файлами (fs/promises)
│   └── validators/
│       └── index.ts            # Zod схемы валидации
├── middleware.ts               # Защита роутов
├── drizzle.config.ts           # Конфигурация Drizzle Kit
└── .env.example                # Шаблон переменных окружения
```

---

## 🔐 Авторизация

Панель защищена авторизацией. По умолчанию:

- **Логин:** `admin`
- **Пароль:** `changeme123` (измените в `.env`!)

Сессия хранится в cookie 24 часа.

---

## 📊 Сущности

### District (Район)

| Поле | Тип | Описание |
|------|-----|----------|
| id | UUID | Первичный ключ |
| name | varchar | Название района |
| description | text | Описание |
| photos | text[] | Фотографии (макс. 3) |
| is_active | boolean | Флаг активности (Soft Delete) |

### Apartment (Квартира)

| Поле | Тип | Описание |
|------|-----|----------|
| id | UUID | Первичный ключ |
| district_id | UUID | Внешний ключ на район |
| name | varchar | Название |
| finishing | enum | Отделка (Чистовая/Вайт бокс/Без отделки) |
| rooms | varchar | Комнаты (1, 1+, 2, студия и т.д.) |
| area | float | Площадь (м²) |
| floor | integer | Этаж |
| price | numeric | Цена (₽) |
| photos | text[] | Фотографии (макс. 10, индекс 0 — обложка) |
| is_active | boolean | Флаг активности (Soft Delete) |

---

## 🗄️ База данных

### Drizzle ORM

Проект использует Drizzle ORM для работы с PostgreSQL:

```bash
# Генерация миграций
npx drizzle-kit generate

# Применение миграций
npx drizzle-kit migrate

# Студия (UI для БД)
npx drizzle-kit studio
```

---

## 📸 Хранение файлов

Фотографии сохраняются локально в структуре:

```
public/uploads/
├── districts/
│   └── {district_uuid}/
│       ├── photo-1234567890-abc123.jpg
│       └── ...
└── apartments/
    └── {apartment_uuid}/
        ├── photo-1234567890-xyz789.jpg
        └── ...
```

### Компонент PhotoUploader

- Поддержка Drag-and-Drop
- Предпросмотр изображений
- Сортировка фото перетаскиванием (первое фото — обложка)
- Валидация типа и размера файла (макс. 5MB)

---

## 🔍 Фильтры и пагинация

### Параметры URL (URL State)

Все фильтры и сортировка хранятся в `searchParams`:

```
/dashboard/apartments?
  page=1&           # Страница
  limit=20&         # Размер страницы
  sort=price_asc&   # Сортировка
  districtId=uuid&  # Фильтр по району
  finishing=Чистовая&
  rooms=2&
  priceMin=10000000&
  priceMax=20000000&
  areaMin=50&
  areaMax=100
```

### Сортировка

Формат: `sort={field}_{order}`

- `price_asc` — цена по возрастанию
- `price_desc` — цена по убыванию
- `area_asc` — площадь по возрастанию
- `created_desc` — дата создания (новые первыми)

---

## 🛡️ Безопасность

1. **Middleware** защищает все роуты кроме `/login` и статики
2. **Server Actions** валидируют данные через Zod
3. **Soft Delete** — записи не удаляются физически (`is_active = false`)
4. **Cookie** с сессией: `HttpOnly`, `Secure` (в production), `SameSite: lax`

---

## 🧪 Технологический стек

- **Фреймворк:** Next.js 16 (App Router, Server Components, Server Actions)
- **Язык:** TypeScript (`strict: true`)
- **База данных:** PostgreSQL + Drizzle ORM
- **Валидация:** Zod
- **UI:** Tailwind CSS v4 + shadcn/ui
- **Иконки:** lucide-react

---

## 📝 Лицензия

Внутренняя разработка для управления недвижимостью.
