/**
 * Скрипт для проверки путей к фото в БД
 */

import postgres from 'postgres';

async function checkPhotoPaths() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL не указана');
    process.exit(1);
  }

  const sql = postgres(process.env.DATABASE_URL);

  try {
    console.log('=== Районы ===');
    const districts = await sql`SELECT id, name, photos FROM districts`;
    districts.forEach(d => {
      console.log(`${d.name}: ${d.photos ? d.photos[0] : 'нет фото'}`);
    });

    console.log('\n=== Квартиры ===');
    const apartments = await sql`SELECT id, name, photos FROM apartments LIMIT 5`;
    apartments.forEach(a => {
      console.log(`${a.name}: ${a.photos ? a.photos[0] : 'нет фото'}`);
    });
  } catch (error) {
    console.error('Ошибка:', error);
  } finally {
    await sql.end();
  }
}

checkPhotoPaths();
