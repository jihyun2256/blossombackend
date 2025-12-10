import { createClient } from 'redis';

const redisUrl = `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT || 6379}`;

const redisClient = createClient({
  url: redisUrl,
  password: process.env.REDIS_PASSWORD || undefined
});

redisClient.on('error', (err) => {
  console.error('Redis connection error (cart-api):', err);
});

let isConnected = false;

export async function initRedis() {
  if (isConnected) return redisClient;
  try {
    await redisClient.connect();
    isConnected = true;
    console.log('✅ Connected to Redis (cart-api)');
  } catch (err) {
    console.error('❌ Failed to connect to Redis (cart-api):', err);
  }
  return redisClient;
}

export default redisClient;
