FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install dependencies first for cache layer optimization
COPY package*.json ./
RUN npm install

# Copy application files
COPY . .

# Set default env
ENV NODE_ENV=production
ENV PORT=3000

# Expose backend port
EXPOSE 3000

# Fallback to tsx server.ts if build fails, assuming standard monorepo npm start
CMD ["npm", "run", "dev"]
