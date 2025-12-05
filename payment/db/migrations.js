import { db } from '../../shared/db.js';

/**
 * Migration utilities for safely modifying existing tables
 */

/**
 * Check if a column exists in a table
 */
async function columnExists(connection, tableName, columnName) {
  const [columns] = await connection.query(
    `SELECT COLUMN_NAME 
     FROM information_schema.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() 
     AND TABLE_NAME = ? 
     AND COLUMN_NAME = ?`,
    [tableName, columnName]
  );
  return columns.length > 0;
}

/**
 * Check if an index exists in a table
 */
async function indexExists(connection, tableName, indexName) {
  const [indexes] = await connection.query(
    `SELECT INDEX_NAME 
     FROM information_schema.STATISTICS 
     WHERE TABLE_SCHEMA = DATABASE() 
     AND TABLE_NAME = ? 
     AND INDEX_NAME = ?`,
    [tableName, indexName]
  );
  return indexes.length > 0;
}

/**
 * Add payment_id column to orders table if it doesn't exist
 */
async function addPaymentIdToOrders(connection) {
  const exists = await columnExists(connection, 'orders', 'payment_id');
  
  if (!exists) {
    console.log('📝 Adding payment_id column to orders table...');
    await connection.query(`
      ALTER TABLE orders 
      ADD COLUMN payment_id VARCHAR(100) AFTER payment_method
    `);
    console.log('✅ payment_id column added');
  } else {
    console.log('✓ payment_id column already exists in orders table');
  }
  
  // Add index if it doesn't exist
  const indexExist = await indexExists(connection, 'orders', 'idx_payment_id');
  if (!indexExist) {
    console.log('📝 Adding index on payment_id...');
    await connection.query(`
      ALTER TABLE orders 
      ADD INDEX idx_payment_id (payment_id)
    `);
    console.log('✅ Index added');
  } else {
    console.log('✓ Index on payment_id already exists');
  }
}

/**
 * Run all migrations for orders and order_items tables
 */
async function migrateOrdersTables() {
  let connection;
  
  try {
    console.log('🔄 Running migrations for orders tables...');
    connection = await db.getConnection();
    
    // Check if orders table exists
    const [tables] = await connection.query(
      `SELECT TABLE_NAME 
       FROM information_schema.TABLES 
       WHERE TABLE_SCHEMA = DATABASE() 
       AND TABLE_NAME = 'orders'`
    );
    
    if (tables.length === 0) {
      console.log('⚠️  orders table does not exist. Please run schema initialization first.');
      return false;
    }
    
    // Add payment_id column if needed
    await addPaymentIdToOrders(connection);
    
    console.log('✅ Orders table migrations completed');
    return true;
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

export { 
  columnExists, 
  indexExists, 
  addPaymentIdToOrders, 
  migrateOrdersTables 
};
