/**
 * 테스트 데이터 생성 스크립트
 * 샘플 주문 및 결제 데이터를 데이터베이스에 추가합니다
 */

import { db } from '../../shared/db.js';
import dotenv from 'dotenv';

dotenv.config();

async function seedDatabase() {
  let connection;
  
  try {
    console.log('🌱 테스트 데이터 생성 시작...\n');
    
    connection = await db.getConnection();
    await connection.beginTransaction();
    
    // 1. 기존 데이터 삭제 (테스트용)
    console.log('🗑️  기존 데이터 삭제 중...');
    await connection.query('DELETE FROM payment_cancellations');
    await connection.query('DELETE FROM payments');
    await connection.query('DELETE FROM order_items');
    await connection.query('DELETE FROM orders');
    await connection.query('DELETE FROM idempotency_keys');
    console.log('✅ 기존 데이터 삭제 완료\n');
    
    // 2. 샘플 주문 생성
    console.log('📦 샘플 주문 생성 중...');
    
    const orders = [
      {
        user_id: 1,
        total_price: 59.98,
        status: 'pending',
        items: [
          { product_id: 101, quantity: 2, price: 29.99 }
        ]
      },
      {
        user_id: 2,
        total_price: 149.99,
        status: 'pending',
        items: [
          { product_id: 102, quantity: 1, price: 99.99 },
          { product_id: 103, quantity: 1, price: 49.99 }
        ]
      },
      {
        user_id: 1,
        total_price: 299.99,
        status: 'paid',
        items: [
          { product_id: 104, quantity: 1, price: 299.99 }
        ]
      },
      {
        user_id: 3,
        total_price: 79.98,
        status: 'pending',
        items: [
          { product_id: 105, quantity: 2, price: 39.99 }
        ]
      }
    ];
    
    const orderIds = [];
    
    for (const order of orders) {
      const [result] = await connection.execute(
        'INSERT INTO orders (user_id, total_price, status) VALUES (?, ?, ?)',
        [order.user_id, order.total_price, order.status]
      );
      
      const orderId = result.insertId;
      orderIds.push(orderId);
      
      // 주문 항목 추가
      for (const item of order.items) {
        await connection.execute(
          'INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)',
          [orderId, item.product_id, item.quantity, item.price]
        );
      }
      
      console.log(`   ✅ 주문 #${orderId} 생성 (사용자: ${order.user_id}, 금액: $${order.total_price}, 상태: ${order.status})`);
    }
    
    console.log(`\n✅ ${orders.length}개의 주문 생성 완료\n`);
    
    // 3. 샘플 결제 생성 (주문 #3에 대해)
    console.log('💳 샘플 결제 생성 중...');
    
    const paymentId = `PAY_${Date.now()}_SAMPLE001`;
    const transactionId = `TXN_${Date.now()}_SAMPLE001`;
    
    await connection.execute(
      `INSERT INTO payments 
       (payment_id, order_id, user_id, amount, payment_method, status, transaction_id, idempotency_key) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [paymentId, orderIds[2], 1, 299.99, 'card', 'completed', transactionId, 'test-idempotency-key-001']
    );
    
    console.log(`   ✅ 결제 ${paymentId} 생성 (주문 #${orderIds[2]})`);
    console.log(`   💰 금액: $299.99`);
    console.log(`   📝 상태: completed`);
    console.log(`   🔑 트랜잭션 ID: ${transactionId}\n`);
    
    // 4. Idempotency key 추가
    console.log('🔑 Idempotency 키 생성 중...');
    
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);
    
    await connection.execute(
      `INSERT INTO idempotency_keys 
       (idempotency_key, request_hash, response_data, expires_at) 
       VALUES (?, ?, ?, ?)`,
      [
        'test-idempotency-key-001',
        'sample-hash-001',
        JSON.stringify({ success: true, payment_id: paymentId }),
        expiresAt
      ]
    );
    
    console.log('   ✅ Idempotency 키 생성 완료\n');
    
    // 트랜잭션 커밋
    await connection.commit();
    
    // 5. 생성된 데이터 요약
    console.log('📊 생성된 데이터 요약:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const [orderCount] = await connection.query('SELECT COUNT(*) as count FROM orders');
    const [paymentCount] = await connection.query('SELECT COUNT(*) as count FROM payments');
    const [itemCount] = await connection.query('SELECT COUNT(*) as count FROM order_items');
    
    console.log(`📦 주문: ${orderCount[0].count}개`);
    console.log(`💳 결제: ${paymentCount[0].count}개`);
    console.log(`📝 주문 항목: ${itemCount[0].count}개`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    // 6. 테스트 가능한 시나리오 안내
    console.log('🧪 테스트 시나리오:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`1️⃣  주문 #${orderIds[0]} - 결제 대기 중 (사용자 1)`);
    console.log(`   → POST /payments 로 결제 처리 가능`);
    console.log('');
    console.log(`2️⃣  주문 #${orderIds[1]} - 결제 대기 중 (사용자 2)`);
    console.log(`   → POST /payments 로 결제 처리 가능`);
    console.log('');
    console.log(`3️⃣  주문 #${orderIds[2]} - 결제 완료 (사용자 1)`);
    console.log(`   → GET /payments/${paymentId} 로 조회 가능`);
    console.log(`   → POST /payments/${paymentId}/cancel 로 취소 가능`);
    console.log('');
    console.log(`4️⃣  주문 #${orderIds[3]} - 결제 대기 중 (사용자 3)`);
    console.log(`   → POST /payments 로 결제 처리 가능`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    console.log('✨ 테스트 데이터 생성 완료!');
    console.log('💡 이제 API 서버를 실행하고 테스트를 시작하세요.\n');
    
    return true;
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    console.error('❌ 테스트 데이터 생성 실패:', error.message);
    throw error;
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

// 직접 실행 시
if (import.meta.url === `file://${process.argv[1]}`) {
  seedDatabase()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 실패:', error);
      process.exit(1);
    });
}

export { seedDatabase };
