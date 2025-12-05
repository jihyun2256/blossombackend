-- Payment System Database Schema
-- This file contains all table definitions for the payment system

-- ============================================
-- 1. Orders and Order Items Tables
-- ============================================

-- Check if orders table exists and create/modify as needed
CREATE TABLE IF NOT EXISTS orders (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  total_price DECIMAL(10, 2) NOT NULL,
  status ENUM('pending', 'paid', 'payment_failed', 'cancelled') DEFAULT 'pending',
  payment_method VARCHAR(50),
  payment_id VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user_id (user_id),
  INDEX idx_status (status),
  INDEX idx_payment_id (payment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS order_items (
  id INT PRIMARY KEY AUTO_INCREMENT,
  order_id INT NOT NULL,
  product_id INT NOT NULL,
  quantity INT NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  INDEX idx_order_id (order_id),
  INDEX idx_product_id (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 2. Payments Table
-- ============================================

CREATE TABLE IF NOT EXISTS payments (
  id INT PRIMARY KEY AUTO_INCREMENT,
  payment_id VARCHAR(100) UNIQUE NOT NULL,
  order_id INT NOT NULL,
  user_id INT NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  payment_method VARCHAR(50) NOT NULL,
  status ENUM('pending', 'completed', 'failed', 'cancelled') DEFAULT 'pending',
  transaction_id VARCHAR(200),
  gateway_response TEXT,
  idempotency_key VARCHAR(100) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id),
  INDEX idx_payment_id (payment_id),
  INDEX idx_order_id (order_id),
  INDEX idx_user_id (user_id),
  INDEX idx_idempotency_key (idempotency_key),
  INDEX idx_status (status),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 3. Payment Cancellations Table
-- ============================================

CREATE TABLE IF NOT EXISTS payment_cancellations (
  id INT PRIMARY KEY AUTO_INCREMENT,
  cancellation_id VARCHAR(100) UNIQUE NOT NULL,
  payment_id VARCHAR(100) NOT NULL,
  reason TEXT,
  cancelled_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (payment_id) REFERENCES payments(payment_id) ON DELETE CASCADE,
  INDEX idx_payment_id (payment_id),
  INDEX idx_cancellation_id (cancellation_id),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 4. Idempotency Keys Table
-- ============================================

CREATE TABLE IF NOT EXISTS idempotency_keys (
  id INT PRIMARY KEY AUTO_INCREMENT,
  idempotency_key VARCHAR(100) UNIQUE NOT NULL,
  request_hash VARCHAR(64) NOT NULL,
  response_data TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_key (idempotency_key),
  INDEX idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
