import express from "express";
import { db } from "../../shared/db.js";

const router = express.Router();

/**
 * 챗봇 예산 기반 상품 추천 엔드포인트
 * POST /lex/recommend
 */
router.post("/recommend", async (req, res) => {
  try {
    const { budget, category } = req.body;

    console.log('🤖 챗봇 상품 추천 요청:', { budget, category });

    if (!budget || isNaN(budget)) {
      return res.status(400).json({
        success: false,
        message: "유효한 예산을 입력해주세요.",
      });
    }

    // 쿼리 작성
    let query = "SELECT * FROM products WHERE price <= ? AND stock > 0";
    const params = [budget];

    if (category) {
      query += " AND category = ?";
      params.push(category);
    }

    query += " ORDER BY price DESC LIMIT 5";

    const [products] = await db.query(query, params);

    console.log(`✅ ${products.length}개 상품 조회 완료`);

    if (products.length === 0) {
      return res.json({
        success: true,
        message: `${parseInt(budget).toLocaleString()}원 이하${
          category ? ` ${category} 카테고리` : ""
        }의 재고가 있는 상품이 없습니다. 😢`,
        products: [],
        count: 0
      });
    }

    // 응답 포맷팅
    let message = `💰 예산 ${parseInt(budget).toLocaleString()}원${
      category ? ` (${category})` : ""
    }에 맞는 추천 상품입니다!\n\n`;

    products.forEach((product, index) => {
      message += `${index + 1}. **${product.name}**\n`;
      message += `   💵 가격: ₩${parseInt(product.price).toLocaleString()}\n`;
      message += `   📦 재고: ${product.stock}개\n`;
      if (product.description) {
        message += `   📝 ${product.description.substring(0, 50)}${
          product.description.length > 50 ? "..." : ""
        }\n`;
      }
      message += `\n`;
    });

    message += `🛒 장바구니에 담으려면 메인 페이지에서 확인해주세요!`;

    return res.json({
      success: true,
      message: message,
      products: products,
      count: products.length,
    });
  } catch (error) {
    console.error("❌ 챗봇 추천 오류:", error);
    return res.status(500).json({
      success: false,
      message: "상품 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
});

/**
 * 카테고리별 상품 조회
 * GET /lex/category/:category
 */
router.get("/category/:category", async (req, res) => {
  try {
    const { category } = req.params;

    console.log("🤖 카테고리 조회:", category);

    const [products] = await db.query(
      "SELECT * FROM products WHERE category = ? AND stock > 0 ORDER BY price DESC LIMIT 5",
      [category]
    );

    if (products.length === 0) {
      return res.json({
        success: true,
        message: `${category} 카테고리의 재고가 있는 상품이 없습니다. 😢`,
        products: [],
        count: 0
      });
    }

    let message = `🏷️ ${category} 카테고리 상품 목록:\n\n`;

    products.forEach((product, index) => {
      message += `${index + 1}. **${product.name}**\n`;
      message += `   💵 ₩${parseInt(product.price).toLocaleString()}\n`;
      message += `   📦 재고: ${product.stock}개\n\n`;
    });

    message += `💡 "예산 XX원으로 ${category} 추천해줘"라고 말씀해보세요!`;

    return res.json({
      success: true,
      message: message,
      products: products,
      count: products.length,
    });
  } catch (error) {
    console.error("❌ 카테고리 조회 오류:", error);
    return res.status(500).json({
      success: false,
      message: "카테고리 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
});

/**
 * 모든 카테고리 목록 조회
 * GET /lex/categories
 */
router.get("/categories", async (req, res) => {
  try {
    console.log("🤖 카테고리 목록 조회");

    const [categories] = await db.query(
      "SELECT DISTINCT category FROM products WHERE stock > 0 ORDER BY category"
    );

    return res.json({
      success: true,
      categories: categories.map(c => c.category),
      count: categories.length,
    });
  } catch (error) {
    console.error("❌ 카테고리 목록 조회 오류:", error);
    return res.status(500).json({
      success: false,
      message: "카테고리 목록 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
});

/**
 * 챗봇 통계 (관리자용)
 * GET /lex/stats
 */
router.get("/stats", async (req, res) => {
  try {
    console.log("📊 챗봇 통계 조회");

    // 카테고리별 상품 수
    const [categoryStats] = await db.query(
      `SELECT category, COUNT(*) as count, 
       AVG(price) as avg_price, 
       SUM(stock) as total_stock
       FROM products 
       WHERE stock > 0 
       GROUP BY category`
    );

    // 전체 통계
    const [totalStats] = await db.query(
      `SELECT 
       COUNT(*) as total_products,
       AVG(price) as avg_price,
       MIN(price) as min_price,
       MAX(price) as max_price,
       SUM(stock) as total_stock
       FROM products 
       WHERE stock > 0`
    );

    return res.json({
      success: true,
      stats: {
        total: totalStats[0],
        byCategory: categoryStats,
      },
    });
  } catch (error) {
    console.error("❌ 통계 조회 오류:", error);
    return res.status(500).json({
      success: false,
      message: "통계 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
});

/**
 * 가격대별 상품 수 조회
 * GET /lex/price-ranges
 */
router.get("/price-ranges", async (req, res) => {
  try {
    console.log("💰 가격대별 상품 조회");

    const [ranges] = await db.query(
      `SELECT 
       CASE 
         WHEN price < 100000 THEN '10만원 미만'
         WHEN price < 300000 THEN '10-30만원'
         WHEN price < 500000 THEN '30-50만원'
         WHEN price < 1000000 THEN '50-100만원'
         ELSE '100만원 이상'
       END as price_range,
       COUNT(*) as count
       FROM products 
       WHERE stock > 0
       GROUP BY price_range
       ORDER BY MIN(price)`
    );

    return res.json({
      success: true,
      priceRanges: ranges,
    });
  } catch (error) {
    console.error("❌ 가격대 조회 오류:", error);
    return res.status(500).json({
      success: false,
      message: "가격대 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
});

export default router;
