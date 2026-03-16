/**
 * Скрипт для исправления путей к фото в БД
 * Приводит пути к виду /uploads/...
 */

import postgres from 'postgres';

async function fixPhotoPaths() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL не указана');
    process.exit(1);
  }

  const sql = postgres(process.env.DATABASE_URL);

  try {
    // Получаем все районы с фото
    const districts = await sql`SELECT id, photos FROM districts WHERE photos IS NOT NULL`;
    
    for (const district of districts) {
      const photos = district.photos.map((path: string) => {
        // Удаляем префикс \public или /public и нормализуем слеши
        let normalized = path.replace(/^[\\/]public[\\/]/i, '/');
        normalized = normalized.replace(/\\/g, '/');
        if (!normalized.startsWith('/')) {
          normalized = '/' + normalized;
        }
        return normalized;
      });
      
      await sql`UPDATE districts SET photos = ${photos} WHERE id = ${district.id}`;
      console.log(`Обновлено фото для района ${district.id}: ${photos[0]}`);
    }

    // Получаем все квартиры с фото
    const apartments = await sql`SELECT id, photos FROM apartments WHERE photos IS NOT NULL`;
    
    for (const apartment of apartments) {
      const photos = apartment.photos.map((path: string) => {
        // Удаляем префикс \public или /public и нормализуем слеши
        let normalized = path.replace(/^[\\/]public[\\/]/i, '/');
        normalized = normalized.replace(/\\/g, '/');
        if (!normalized.startsWith('/')) {
          normalized = '/' + normalized;
        }
        return normalized;
      });
      
      await sql`UPDATE apartments SET photos = ${photos} WHERE id = ${apartment.id}`;
      console.log(`Обновлено фото для квартиры ${apartment.id}: ${photos[0]}`);
    }

    console.log('\nГотово! Все пути исправлены.');
  } catch (error) {
    console.error('Ошибка:', error);
  } finally {
    await sql.end();
  }
}

fixPhotoPaths();
