# Stage 1 
# Use an official Node.js image
FROM node:20-alpine AS builder

# Create the working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application
COPY . .

# Stage 2
FROM node:20-alpine

WORKDIR /app

COPY --from=builder /app .

# Security - switch user to "node"
USER node

# Tell Docker the application uses port 3000
EXPOSE 3000

# Start the application
CMD ["npm", "start"]

