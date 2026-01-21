FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY vendor/ ./vendor/
COPY node_modules/ ./node_modules/
COPY dist/ ./dist/
EXPOSE 8080
CMD ["npm", "start"]