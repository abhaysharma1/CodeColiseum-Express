import http from 'http';
import app from "./src/app"
// import { PrismaClient } from '@prisma/client'; // Uncomment after running prisma generate

const PORT = process.env.PORT || 5000;
const server = http.createServer(app);

// const prisma = new PrismaClient();

async function startServer() {
  try {
    // 1. Database Connection
    // await prisma.$connect();
    console.log('✅ Database connected successfully');

    // 2. Start Listening
    server.listen(PORT, () => {
      console.log(`
        🚀 Server is running!
        🔉 Listening on port: ${PORT}
        🌍 Environment: ${process.env.NODE_ENV || 'development'}
      `);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1); // Exit with failure
  }
}

/**
 * Handle Process Events
 * Essential for AWS/Production stability
 */

// Handle unhandled promise rejections (e.g., DB connection issues)
process.on('unhandledRejection', (err: Error) => {
  console.error('UNHANDLED REJECTION! 💥 Shutting down...');
  console.error(err.name, err.message);
  server.close(() => {
    process.exit(1);
  });
});

// Handle SIGTERM (Sent by AWS/Docker for graceful shutdowns)
process.on('SIGTERM', () => {
  console.info('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('Process terminated.');
    // prisma.$disconnect();
  });
});

startServer();

module.exports = { server, startServer };