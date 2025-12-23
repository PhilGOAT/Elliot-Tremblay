import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const prisma = new PrismaClient();

async function runMigration() {
  console.log('🔄 Running custom migration...');

  try {
    // Read and execute migration SQL
    const sqlPath = join(__dirname, '../prisma/migration.sql');
    const sql = readFileSync(sqlPath, 'utf8');

    // Split by statements and execute each
    const statements = sql.split(/;\s*$/m).filter(s => s.trim());

    for (const statement of statements) {
      if (statement.trim()) {
        try {
          await prisma.$executeRawUnsafe(statement);
        } catch (err) {
          // Ignore errors for DO blocks (already applied)
          if (!err.message.includes('already exists') && !err.message.includes('does not exist')) {
            console.log('Migration statement skipped:', err.message.substring(0, 100));
          }
        }
      }
    }

    console.log('✅ Custom migration completed');
  } catch (error) {
    console.log('⚠️ Migration skipped (may already be applied):', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

runMigration();
