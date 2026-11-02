import { Server } from 'socket.io';

export let io;

export function initSocket(httpServer, sessionMiddleware) {
    io = new Server(httpServer);

    io.use((socket, next) => {
        sessionMiddleware(socket.request, {}, (err) => {
            if (err) return next(err);

            const userId = socket.request.session?.userId;

            if (!userId) {
                return next(new Error('Unauthorized'));
            }

            socket.data.userId = userId;
            next();
        });
    });

    io.on('connection', (socket) => {
        socket.join(`user:${socket.data.userId}`);

        console.log(`Socket connected for user ${socket.data.userId}`);

        socket.on('disconnect', () => {
            console.log(`Socket disconnected for user ${socket.data.userId}`);
        });
    });

    return io;
}

// Send an event to every socket a given user has open.
export function emitToUser(userId, event, data) {
    if (!io) {
        throw new Error('Socket.IO has not been initialized');
    }

    io.to(`user:${userId}`).emit(event, data);
}
