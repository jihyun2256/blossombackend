import { initializeDatabase } from './init.js';
import { migrateOrdersTables } from './migrations.js';

/**
 * Complete database setup for payment system
 * This script will:
 * 1. Create all necessary tables
 * 2. Run migrations for existing tables
 */
async function setupDatabase() {
  try {
    console.log('🚀 Starting payment system database setup...\n');
    
    // Step 1: Initialize schema (create tables)
    console.log('Step 1: Initializing database schema...');
    await initializeDatabase();
    
    console.log('\n' + '='.repeat(50) + '\n');
    
    // Step 2: Run migrations (modify existing tables)
    console.log('Step 2: Running migrations...');
    await migrateOrdersTables();
    
    console.log('\n' + '='.repeat(50) + '\n');
    console.log('✨ Payment system database setup completed successfully!');
    console.log('\nYou can now start the payment API service.');
    
  } catch (error) {
    console.error('\n💥 Database setup failed:', error.message);
    console.error('\nPlease check:');
    console.error('  1. Database connection settings in .env');
    console.error('  2. Database server is running');
    console.error('  3. Database user has proper permissions');
    process.exit(1);
  }
}

// Run setup
setupDatabase()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
