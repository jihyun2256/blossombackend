# Quick Start - Payment Database Setup

## 🚀 Quick Setup (One Command)

```bash
npm run db:setup
```

This will:
1. Create all necessary tables (orders, order_items, payments, payment_cancellations, idempotency_keys)
2. Add payment_id column to existing orders table (if needed)
3. Create all required indexes

## 📋 Prerequisites

Make sure your `.env` file has database configuration:

```env
DB_HOST=localhost
DB_USER=your_user
DB_PASSWORD=your_password
DB_NAME=your_database
```

## ✅ Verify Setup

After running setup, check that all tables exist:

```bash
mysql -u your_user -p -e "USE your_database; SHOW TABLES;"
```

Expected tables:
- ✓ orders
- ✓ order_items
- ✓ payments
- ✓ payment_cancellations
- ✓ idempotency_keys

## 🔧 Individual Commands

If you need to run specific parts:

```bash
# Only create tables
npm run db:init

# Only run migrations (add columns to existing tables)
npm run db:migrate
```

## 📊 Table Overview

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| **orders** | Store order information | id, user_id, total_price, status, payment_id |
| **order_items** | Store order line items | id, order_id, product_id, quantity, price |
| **payments** | Store payment transactions | payment_id, order_id, amount, status, idempotency_key |
| **payment_cancellations** | Store cancellation records | cancellation_id, payment_id, reason |
| **idempotency_keys** | Prevent duplicate payments | idempotency_key, response_data, expires_at |

## 🔒 Security Notes

- ⚠️ **NEVER** store raw card numbers or CVV codes
- Only store payment gateway tokens and transaction IDs
- All queries use parameterized statements to prevent SQL injection
- Sensitive data is encrypted before storage

## 🆘 Troubleshooting

### "Cannot connect to database"
- Check MySQL server is running
- Verify credentials in `.env`
- Ensure database exists

### "Table already exists"
- This is normal! The script uses `CREATE TABLE IF NOT EXISTS`
- Existing tables won't be modified

### "Foreign key constraint fails"
- Tables must be created in order (handled automatically by schema.sql)
- If manually creating, follow the order in schema.sql

## 📚 More Information

See [README.md](./README.md) for detailed documentation.
