# Create a Lightweight Docker File for the nodejs app
FROM node:18.12.1-alpine
WORKDIR /app
COPY package.json .
RUN npm install
COPY . .
CMD ["node", "index.js"]