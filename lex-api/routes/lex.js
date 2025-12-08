import express from "express";
import { 
  LexRuntimeV2Client, 
  RecognizeTextCommand 
} from "@aws-sdk/client-lex-runtime-v2";
import { db } from "../../shared/db.js";

const router = express.Router();

// AWS Lex 클라이언트 설정
const lexClient = new LexRuntimeV2Client({
  region: process.env.AWS_REGION || "ap-northeast-2",
  // EKS IRSA를 사용하면 자동으로 credentials 가져옴
  // 로컬 개발시에는 AWS CLI 설정 사용
});

// Lex 봇 설정
const LEX_CONFIG = {
  botId: process.env.LEX_BOT_ID,
  botAliasId: process.env.LEX_BOT_ALIAS_ID,
  localeId: process.env.LEX_LOCALE_ID || "ko_KR",
};

console.log("🤖 Lex 설정:", {
  region: process.env.AWS_REGION,
  botId: LEX_CONFIG.botId ? "✅ 설정됨" : "❌ 미설정",
  botAliasId: LEX_CONFIG.botAliasId ? "✅ 설정됨" : "❌ 미설정",
});

/**
 * AWS Lex와 대화하는 메인 엔드포인트
 * POST /lex/chat
 */
router.post("/chat", async (req, res) => {
  try {
    const { message, sessionId } = req.body;

    if (!message || !sessionId) {
      return res.status(400).json({
        success: false,
        message: "message와 sessionId는 필수입니다.",
      });
    }

    console.log("🤖 챗봇 메시지:", { message, sessionId });

    // Lex 봇 설정 확인
    if (!LEX_CONFIG.botId || !LEX_CONFIG.botAliasId) {
      console.warn("⚠️ Lex 봇이 설정되지 않았습니다. Mock 응답 사용");
      return res.json(getMockResponse(message));
    }

    // AWS Lex에 메시지 전송
    const command = new RecognizeTextCommand({
      botId: LEX_CONFIG.botId,
      botAliasId: LEX_CONFIG.botAliasId,
      localeId: LEX_CONFIG.localeId,
      sessionId: sessionId,
      text: message,
    });

    const lexResponse = await lexClient.send(command);

    console.log("✅ Lex 응답 받음:", {
      intent: lexResponse.sessionState?.intent?.name,
      state: lexResponse.sessionState?.intent?.state,
    });

    // Intent가 ProductRecommendIntent이고 Fulfilled 상태인 경우
    if (
      lexResponse.sessionState?.intent?.name === "ProductRecommendIntent" &&
      lexResponse.sessionState?.intent?.state === "Fulfilled"
    ) {
      const slots = lexResponse.sessionState.intent.slots;
      const budget = slots?.Budget?.value?.interpretedValue;
      const category = slots?.Category?.value?.interpretedValue;

      console.log("📊 추출된 슬롯:", { budget, category });

      // 실제 상품 데이터 조회
      const products = await getProductsByBudget(budget, category);

      // 응답 생성
      const responseMessage = formatProductResponse(budget, category, products);

      return res.json({
        success: true,
        message: responseMessage,
        products: products,
        count: products.length,
        lexIntent: lexResponse.sessionState?.intent?.name,
        slots: { budget, category },
      });
    }

    // 기본 Lex 응답 반환
    const botMessage = lexResponse.messages?.[0]?.content || 
                      "죄송합니다. 다시 말씀해주세요.";

    return res.json({
      success: true,
      message: botMessage,
      lexIntent: lexResponse.sessionState?.intent?.name,
    });

  } catch (error) {
    console.error("❌ Lex 챗봇 오류:", error);
    
    // Lex 연결 실패시 Mock 응답
    if (error.name === 'AccessDeniedException' || error.name === 'ResourceNotFoundException') {
      console.warn("⚠️ Lex 연결 실패, Mock 응답 사용");
      return res.json(getMockResponse(req.body.message));
    }

    return res.status(500).json({
      success: false,
      message: "챗봇 처리 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
});

/**
 * 예산과 카테고리로 상품 조회
 */
async function getProductsByBudget(budgetStr, category) {
  try {
    // 예산 파싱 (만원 단위 처리)
    let budget = parseFloat(budgetStr);
    
    // "50만원" 같은 형식 처리
    if (budgetStr && budgetStr.includes("만")) {
      const num = parseFloat(budgetStr.replace(/[^0-9.]/g, ""));
      budget = num * 10000;
    }

    console.log(`🔍 상품 조회: 예산=${budget}, 카테고리=${category}`);

    let query = "SELECT * FROM products WHERE price <= ? AND stock > 0";
    const params = [budget];

    if (category) {
      query += " AND category = ?";
      params.push(category);
    }

    query += " ORDER BY price DESC LIMIT 5";

    const [products] = await db.query(query, params);

    console.log(`✅ ${products.length}개 상품 조회 완료`);

    return products;
  } catch (error) {
    console.error("❌ 상품 조회 오류:", error);
    return [];
  }
}

/**
 * 상품 목록 응답 포맷팅
 */
function formatProductResponse(budget, category, products) {
  const budgetNum = typeof budget === 'string' && budget.includes('만') 
    ? parseFloat(budget) * 10000 
    : parseFloat(budget);

  if (products.length === 0) {
    return `${budgetNum.toLocaleString()}원 이하${
      category ? ` ${category} 카테고리` : ""
    }의 재고가 있는 상품이 없습니다. 😢`;
  }

  let message = `💰 예산 ${budgetNum.toLocaleString()}원${
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

  return message;
}

/**
 * Mock 응답 (개발/테스트용, Lex 미설정시)
 */
function getMockResponse(message) {
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes("안녕") || lowerMessage.includes("hi")) {
    return {
      success: true,
      message: "안녕하세요! 👋 예산을 말씀해주시면 맞춤 상품을 찾아드려요!",
    };
  }

  if (lowerMessage.includes("도움") || lowerMessage.includes("help")) {
    return {
      success: true,
      message:
        "💡 사용 방법:\n\n1. 'XX만원으로 YY 추천해줘'\n2. 'XX원 이하 ZZ 보여줘'\n\n예시: '50만원으로 노트북 추천해줘'",
    };
  }

  // 예산이 있는 경우 Mock 응답
  const budgetMatch = message.match(/(\d+)만원|(\d+)원/);
  if (budgetMatch) {
    const budget = budgetMatch[1]
      ? parseInt(budgetMatch[1]) * 10000
      : parseInt(budgetMatch[2]);
    return {
      success: true,
      message: `💰 예산 ${budget.toLocaleString()}원으로 검색 중...\n\n⚠️ 현재 Mock 모드입니다.\nAWS Lex 봇을 설정하려면 LEX_BOT_ID와 LEX_BOT_ALIAS_ID 환경변수를 설정해주세요!`,
    };
  }

  return {
    success: true,
    message:
      "죄송합니다. 이해하지 못했어요. 😅\n\n'예산 XX원으로 제품명 추천해줘' 형식으로 말씀해주세요!",
  };
}

/**
 * 레거시 엔드포인트: 챗봇 예산 기반 상품 추천
 * POST /lex/recommend
 * (기존 API 호환성 유지)
 */
router.post("/recommend", async (req, res) => {
  try {
    const { budget, category } = req.body;

    console.log("🤖 레거시 상품 추천 요청:", { budget, category });

    if (!budget || isNaN(budget)) {
      return res.status(400).json({
        success: false,
        message: "유효한 예산을 입력해주세요.",
      });
    }

    const products = await getProductsByBudget(budget, category);
    const message = formatProductResponse(budget, category, products);

    return res.json({
      success: true,
      message: message,
      products: products,
      count: products.length,
    });
  } catch (error) {
    console.error("❌ 레거시 추천 오류:", error);
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
        count: 0,
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
      categories: categories.map((c) => c.category),
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

/**
 * Health check
 * GET /lex/health
 */
router.get("/health", async (req, res) => {
  const lexConfigured = !!(LEX_CONFIG.botId && LEX_CONFIG.botAliasId);
  
  res.json({
    success: true,
    status: "healthy",
    lex: {
      configured: lexConfigured,
      botId: LEX_CONFIG.botId ? "✅" : "❌",
      botAliasId: LEX_CONFIG.botAliasId ? "✅" : "❌",
      region: process.env.AWS_REGION || "ap-northeast-2",
    },
  });
});

export default router;
