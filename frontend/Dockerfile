# syntax=docker/dockerfile:1
FROM node:25-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]
