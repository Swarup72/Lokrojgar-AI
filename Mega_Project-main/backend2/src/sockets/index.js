import { registerChatHandlers } from "./chatHandler.js";

/**
 * Initialize Socket.io Connection & Event Listeners
 * @param {import("socket.io").Server} io
 */
export const initSockets = (io) => {
  io.on("connection", (socket) => {
    console.log(`Socket Client Connected: ${socket.id}`);

    // Register module socket handlers
    registerChatHandlers(io, socket);

    socket.on("disconnect", (reason) => {
      console.log(`Socket Client Disconnected (${socket.id}): ${reason}`);
    });
  });
};
