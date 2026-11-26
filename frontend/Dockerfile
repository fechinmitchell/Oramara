# oramara/frontend/Dockerfile
# Runs the website and admin with the Vite dev server for use on your own computer.
FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
EXPOSE 5173
CMD ["npx", "vite", "--host", "0.0.0.0", "--port", "5173"]
