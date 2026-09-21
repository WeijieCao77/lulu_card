FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/*.js ./
COPY --from=build /app/railway.json ./railway.json
COPY --from=build /app/scripts/refund_stranded_offers.js /app/scripts/precompress.mjs ./scripts/
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
USER node
CMD ["npm", "start"]
