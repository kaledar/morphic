# Use the Bun base image
FROM oven/bun:1.1.3-alpine as builder

# Install necessary dependencies
RUN apk add --no-cache nodejs npm

# Set working directory
WORKDIR /app

# Copy package.json and bun.lockb (if it exists)
COPY package.json bun.lockb* ./

# Install dependencies
RUN bun install

# Copy the rest of the application code
COPY . .

# Build the Next.js application
RUN bun run build

# Disable Next.js telemetry
RUN bun next telemetry disable

# Start a new stage for a smaller final image
FROM oven/bun:1.1.3-alpine

# Copy the built application from the builder stage
COPY --from=builder /app /app

# Set working directory
WORKDIR /app

# Expose the port the app runs on
EXPOSE 3000

# Set environment variable for production
ENV NODE_ENV=production

# Run the application
CMD ["bun", "start"]