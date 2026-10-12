# 쉬운 음악 만들기 — 웹 (PLAN 결정 49): vite build 결과를 nginx로, /api/ → api:8000
# docker-compose.yml의 web 서비스가 사용 (build context = frontend/)

# 1) 빌드
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY index.html tsconfig.json vite.config.ts ./
COPY src ./src
# 테스트(*.test.ts)는 타입 검사만 되고 번들에는 들어가지 않는다
RUN npm run build

# 2) 실행
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
