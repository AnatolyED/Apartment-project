/**
 * Скрипт для добавления city_id в districts с дефолтным городом
 */

import postgres from 'postgres';

async function addCityColumn() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL не указана');
    process.exit(1);
  }

  const sql = postgres(process.env.DATABASE_URL);

  try {
    // Создаем дефолтный город
    const defaultCity = await sql`
      INSERT INTO cities (id, name, description, is_active, created_at, updated_at)
      VALUES (gen_random_uuid(), 'Город по умолчанию', '', true, NOW(), NOW())
      ON CONFLICT DO NOTHING
      RETURNING id
    `;

    const cityId = defaultCity[0]?.id;

    if (!cityId) {
      console.log('Город уже существует или не создан');
      const cities = await sql`SELECT id FROM cities LIMIT 1`;
      if (cities.length === 0) {
        console.error('Нет городов в БД');
        return;
      }
      const firstCity = await sql`SELECT id FROM cities LIMIT 1`;
      const cityId = firstCity[0].id;
      
      // Добавляем колонку с дефолтным значением
      await sql`ALTER TABLE districts ADD COLUMN IF NOT EXISTS city_id uuid REFERENCES cities(id) DEFAULT ${cityId}`;
      await sql`ALTER TABLE districts ALTER COLUMN city_id DROP DEFAULT`;
      await sql`ALTER TABLE districts ALTER COLUMN city_id SET NOT NULL`;
      
      console.log('Колонка city_id добавлена с дефолтным городом');
      return;
    }

    console.log('Создан дефолтный город:', cityId);

    // Добавляем колонку с дефолтным значением
    await sql`ALTER TABLE districts ADD COLUMN IF NOT EXISTS city_id uuid REFERENCES cities(id) DEFAULT ${cityId}`;
    
    // Убираем дефолтное значение
    await sql`ALTER TABLE districts ALTER COLUMN city_id DROP DEFAULT`;
    
    // Делаем поле NOT NULL
    await sql`ALTER TABLE districts ALTER COLUMN city_id SET NOT NULL`;

    console.log('Колонка city_id успешно добавлена в таблицу districts');
  } catch (error) {
    console.error('Ошибка:', error);
  } finally {
    await sql.end();
  }
}

addCityColumn();
