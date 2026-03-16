/**
 * Скрипт для исправления путей с двойным слешем
 */

import postgres from 'postgres';

async function fixDoubleSlash() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL не указана');
    process.exit(1);
  }

  const sql = postgres(process.env.DATABASE_URL);

  try {
    // Исправляем пути с двойным слешем
    const result = await sql`
      UPDATE districts 
      SET photos = (
        SELECT array_agg(
          CASE 
            WHEN photo LIKE '//%' THEN substring(photo FROM 2)
            ELSE photo
          END
        )
        FROM unnest(photos) AS photo
      )
      WHERE photos IS NOT NULL
    `;
    
    console.log('Обновлено районов:', result.count);
    console.log('Готово!');
  } catch (error) {
    console.error('Ошибка:', error);
  } finally {
    await sql.end();
  }
}

fixDoubleSlash();
