FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm install

# Copy project files
COPY . .

# Use environment variable for port
ENV VITE_PORT=5173
EXPOSE 5173

# Standard dev command
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
