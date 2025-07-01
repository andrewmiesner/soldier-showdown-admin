const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs').promises;

const app = express();

// Create HTTP server (Cloudflare handles SSL)
const server = http.createServer(app);

const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const port = process.env.PORT || 3000;
const dataFilePath = path.join(__dirname, 'data.json');
console.log('Data file path:', dataFilePath);

function log(message) {
    console.log(`[Server] ${message}`);
}

// Ensure each caster has an id
function ensureCasterIds(casters) {
    return casters.map((caster, index) => ({
        id: caster.id || index,
        ...caster
    }));
}

// Initialize data structure
let dataStore = {
  streams: [],
  selectedStreams: [],
  casters: [],
  leaderboard: Array(8).fill().map(() => ({ name: '', score: 0 })), // Initialize with 8 empty entries
  message: ''
};

// Load data from file
async function loadData() {
    try {
        const data = await fs.readFile(dataFilePath, 'utf8');
        console.log('Raw data loaded from file:', data);
        const loadedData = JSON.parse(data);
        console.log('Parsed data:', loadedData);
        dataStore = {
            streams: Array.isArray(loadedData.streams) ? loadedData.streams : [],
            casters: Array.isArray(loadedData.casters) ? ensureCasterIds(loadedData.casters) : [],
            leaderboard: Array.isArray(loadedData.leaderboard) ? loadedData.leaderboard : Array(8).fill().map(() => ({ name: "", score: 0 })),
            message: loadedData.message || "",
            selectedStreams: Array.isArray(loadedData.selectedStreams) ? loadedData.selectedStreams : []
        };
        console.log('Processed dataStore:', dataStore);
        log('Data loaded from file');
    } catch (error) {
        if (error.code === 'ENOENT') {
            log('No existing data file, starting with empty data');
            await saveData(); // Create the file with initial structure
        } else {
            console.error('Error reading data file:', error);
        }
    }
}

// Save data to file
async function saveData() {
    try {
        const dataToSave = JSON.stringify(dataStore, null, 2);
        await fs.writeFile(dataFilePath, dataToSave);
        log('Data saved to file');
        
    } catch (error) {
        console.error('Error writing data file:', error);
    }
}

app.use(express.static(path.join(__dirname, 'public')));

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        port: port,
        env: process.env.NODE_ENV || 'development'
    });
});

io.on('connection', (socket) => {
    log('A user connected');

    // Send initial state to the newly connected client
    socket.emit('initialState', dataStore);

    // Send initial state to graphics when they connect
    const query = socket.handshake.query;
    if (query.type === 'graphic') {
        log(`Sending initial state to ${query.source} graphic`);
        socket.emit('initial_state', {
          casters: dataStore.casters,
          players: dataStore.players || [],
          streams: dataStore.streams,
          selectedStreams: dataStore.selectedStreams, // Add this line
          leaderboard: dataStore.leaderboard,
          message: dataStore.message
        });
    }

    // Handle updates
    socket.on('update', async (update) => {
        const { type, data } = update;
        log(`Received update: ${type}`);
        
        switch (type) {
            case 'ADD_STREAM':
                log(`Adding stream: ${JSON.stringify(data)}`);
                dataStore.streams.push(data);
                break;
            case 'UPDATE_STREAM':
                log(`Updating stream: ${JSON.stringify(data)}`);
                const streamIndex = dataStore.streams.findIndex(s => s.id === data.id);
                if (streamIndex !== -1) {
                    dataStore.streams[streamIndex] = data;
                }
                break;
            case 'REMOVE_STREAM':
                log(`Removing stream: ${data.id}`);
                dataStore.streams = dataStore.streams.filter(s => s.id !== data.id);
                // Also remove this stream from selectedStreams if it's selected
                dataStore.selectedStreams = dataStore.selectedStreams.map(id => id === data.id ? null : id);
                break;
            case 'UPDATE_CASTER':
                const { id, caster } = data;
                console.log('Updating caster:', { id, caster });
                console.log('Current casters:', dataStore.casters);
                
                // Find the index of the caster to update
                const casterIndex = dataStore.casters.findIndex(c => c.id === id);
                
                if (casterIndex !== -1) {
                    // Update the existing caster
                    dataStore.casters[casterIndex] = { ...dataStore.casters[casterIndex], ...caster };
                } else {
                    // If the caster doesn't exist, add a new one
                    dataStore.casters.push({ id, ...caster });
                }
                
                console.log('Updated casters:', dataStore.casters);
                // Write the updated state to file
                await saveData();
                // Broadcast the update to all clients
                io.emit('update', update);
                break;
            case 'UPDATE_LEADERBOARD':
                log('Updating entire leaderboard');
                dataStore.leaderboard = data;
                break;
            case 'UPDATE_MESSAGE':
                log(`Updating message: ${data}`);
                dataStore.message = data;
                break;
            case 'UPDATE_SELECTED_STREAM':
                log(`Updating selected stream at slot ${data.slot}: ${data.streamId}`);
                if (data.slot >= 0 && data.slot < 3) {
                    dataStore.selectedStreams[data.slot] = data.streamId;
                }
                break;
            default:
                log(`Unhandled update type: ${type}`);
                return;
        }

        // Save data after each update
        await saveData();

        // Broadcast the update to all clients
        io.emit('update', update);
    });

    socket.on('UPDATE_CASTER', (data) => {
        log('Received update: UPDATE_CASTER');
        console.log('Updating caster:', data);
        
        const casterIndex = dataStore.casters.findIndex(c => c.id === data.id);
        if (casterIndex !== -1) {
          dataStore.casters[casterIndex] = { ...dataStore.casters[casterIndex], ...data.caster };
          console.log('Updated casters:', dataStore.casters);
          
          // Broadcast the update to all graphics
          io.emit('caster_update', {
            id: data.id,
            name: data.caster.name,
            handle: data.caster.handle
          });
          
          saveData();
        }
    });

    socket.on('disconnect', () => {
        log('User disconnected');
    });
});

// Load data before starting the server
loadData().then(() => {
    server.listen(port, '0.0.0.0', () => {
        console.log(`Soldier Showdown Admin server listening on port ${port}`);
        console.log(`Server accessible at http://0.0.0.0:${port}`);
        console.log(`Using Cloudflare for SSL termination`);
    });
});
