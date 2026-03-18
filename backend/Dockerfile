FROM node:20-alpine

WORKDIR /app

# Copy package.json and npm install
COPY package*.json ./
RUN npm install --production

# Copy the rest of the application
COPY . .

# Expose backend port
EXPOSE 8001

# Start the server
CMD ["npm", "start"]
