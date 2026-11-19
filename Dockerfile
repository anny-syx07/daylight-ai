FROM node:22-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production PORT=3001 DATA_DIR=/data
RUN mkdir -p /data && chown node:node /data /app
USER node
EXPOSE 3001
CMD ["npm", "start"]
