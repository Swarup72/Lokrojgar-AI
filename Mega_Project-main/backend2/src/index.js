import dotenv from "dotenv";
import http from "http";
import mongoose from "mongoose";
import { Server } from "socket.io";
import connectDB from "./db/index.js";
import { app } from "./app.js";

dotenv.config({
  path: "./.env",
});

// Create HTTP Server wrapping Express app
const server = http.createServer(app);

// Attach Socket.io to HTTP Server
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || "*",
    credentials: true,
  },
});

app.set("io", io);

io.on("connection", (socket) => {
  console.log(`⚡ Socket connected: ${socket.id}`);

  socket.on("disconnect", () => {
    console.log(`🔥 Socket disconnected: ${socket.id}`);
  });
});

let serverListener;

// Graceful Shutdown Handler
const gracefulShutdown = (signal) => {
  console.log(`\n⚠️ Received ${signal}. Initiating graceful shutdown...`);

  if (serverListener) {
    serverListener.close(() => {
      console.log("HTTP server closed.");
      mongoose.connection
        .close(false)
        .then(() => {
          console.log("MongoDB connection closed.");
          process.exit(0);
        })
        .catch((err) => {
          console.error("Error during MongoDB disconnection:", err);
          process.exit(1);
        });
    });
  } else {
    process.exit(0);
  }

  // Force shutdown after 10 seconds if connections hang
  setTimeout(() => {
    console.error("Could not close connections in time, forcefully shutting down.");
    process.exit(1);
  }, 10000);
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  gracefulShutdown("uncaughtException");
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  gracefulShutdown("unhandledRejection");
});

// Connect to MongoDB and start HTTP server
connectDB()
  .then(() => {
    const PORT = process.env.PORT || 8000;
    serverListener = server.listen(PORT, () => {
      console.log(`⚙️ Server is running at port : ${PORT}`);
    });
  })
  .catch((err) => {
    console.log("MONGO db connection failed !!! ", err);
    process.exit(1);
  });
