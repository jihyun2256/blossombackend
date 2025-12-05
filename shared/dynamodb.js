import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import dotenv from "dotenv";

dotenv.config();

// DynamoDB 클라이언트 생성
const client = new DynamoDBClient({
  region: process.env.AWS_REGION || "ap-northeast-2",
  // EC2 IAM Role을 사용하므로 자격 증명은 자동으로 처리됨
});

// Document Client로 래핑 (간단한 CRUD 작업용)
export const dynamoDB = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    convertEmptyValues: true, // 빈 문자열을 null로 변환
    removeUndefinedValues: true, // undefined 값 제거
    convertClassInstanceToMap: true,
  },
  unmarshallOptions: {
    wrapNumbers: false, // 숫자를 Number 타입으로 변환
  },
});

// 테이블 이름
export const TABLES = {
  CART: process.env.DYNAMODB_CART_TABLE || "megapang-cart",
  PAYMENT: process.env.DYNAMODB_PAYMENT_TABLE || "megapang-payment",
};
