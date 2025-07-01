function createSocketHandlers(io, dataService) {
    return {
        handleConnection: (socket) => {
            console.log('[Server] A user connected');

            // Send initial state to the newly connected client
            socket.emit('initialState', dataService.getData());

            // Send initial state to graphics when they connect
            const query = socket.handshake.query;
            if (query.type === 'graphic') {
                console.log(`[Server] Sending initial state to ${query.source} graphic`);
                const data = dataService.getData();
                socket.emit('initial_state', {
                    casters: data.casters,
                    players: data.players || [],
                    streams: data.streams,
                    selectedStreams: data.selectedStreams,
                    leaderboard: data.leaderboard,
                    message: data.message
                });
            }

            // Handle updates
            socket.on('update', async (update) => {
                const { type, data } = update;
                console.log(`[Server] Received update: ${type}`);
                
                try {
                    switch (type) {
                        case 'ADD_STREAM':
                            console.log(`[Server] Adding stream: ${JSON.stringify(data)}`);
                            dataService.addStream(data);
                            break;
                        case 'UPDATE_STREAM':
                            console.log(`[Server] Updating stream: ${JSON.stringify(data)}`);
                            dataService.updateStream(data);
                            break;
                        case 'REMOVE_STREAM':
                            console.log(`[Server] Removing stream: ${data}`);
                            dataService.removeStream(data);
                            break;
                        case 'UPDATE_CASTER':
                            const { id, caster } = data;
                            console.log('[Server] Updating caster:', { id, caster });
                            dataService.updateCaster(id, caster);
                            break;
                        case 'UPDATE_LEADERBOARD':
                            console.log('[Server] Updating entire leaderboard');
                            dataService.updateLeaderboard(data);
                            break;
                        case 'UPDATE_MESSAGE':
                            console.log(`[Server] Updating message: ${data}`);
                            dataService.updateMessage(data);
                            break;
                        case 'UPDATE_SELECTED_STREAM':
                            console.log(`[Server] Updating selected stream at slot ${data.slot}: ${data.streamId}`);
                            dataService.updateSelectedStream(data.slot, data.streamId);
                            break;
                        default:
                            console.log(`[Server] Unhandled update type: ${type}`);
                            return;
                    }

                    // Save data after each update
                    await dataService.saveData();

                    // Broadcast the update to all clients
                    io.emit('update', update);
                } catch (error) {
                    console.error('Error handling update:', error);
                }
            });

            socket.on('UPDATE_CASTER', async (data) => {
                console.log('[Server] Received update: UPDATE_CASTER');
                console.log('Updating caster:', data);
                
                try {
                    dataService.updateCaster(data.id, data.caster);
                    
                    // Broadcast the update to all graphics
                    io.emit('caster_update', {
                        id: data.id,
                        name: data.caster.name,
                        handle: data.caster.handle
                    });
                    
                    await dataService.saveData();
                } catch (error) {
                    console.error('Error updating caster:', error);
                }
            });

            socket.on('disconnect', () => {
                console.log('[Server] User disconnected');
            });
        }
    };
}

module.exports = createSocketHandlers;