# Use an official Node.js image
FROM node:20-alpine

# Create the working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application
COPY . .

# Tell Docker the application uses port 3000
EXPOSE 3000

# Start the application
CMD ["npm", "start"]