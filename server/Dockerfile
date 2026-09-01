FROM node:26-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY src ./src
COPY sql ./sql
COPY admin ./admin
EXPOSE 8080
USER node
CMD ["node", "src/index.js"]
