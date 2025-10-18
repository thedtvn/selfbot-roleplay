FROM node:22-alpine AS builder

WORKDIR /build

COPY package*.json ./
RUN npm ci --silent

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

FROM node:22-alpine AS runner

WORKDIR /selfbot_roleplay

COPY --from=builder /build/dist ./dist
COPY package*.json ./
COPY configs ./configs

RUN npm ci --omit=dev --silent

ENV NODE_ENV=production
ENV IS_DOCKER=true

CMD ["node", "."]