FROM node:18-alpine
WORKDIR /usr/src/app

# 1. 서비스 의존성 설치
COPY product-api/package.json ./
RUN npm install --omit=dev

# 2. 서비스 코드 복사
COPY product-api/ ./

# 3. shared 의존성 설치
COPY shared/package.json /usr/src/shared/
RUN cd /usr/src/shared && npm install
COPY shared/ /usr/src/shared/

EXPOSE 3002
CMD ["node", "app.js"]
