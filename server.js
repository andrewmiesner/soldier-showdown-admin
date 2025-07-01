const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const auth = require('basic-auth');
require('dotenv').config();

const DataService = require('./services/dataService');
const createSocketHandlers = require('./handlers/socketHandlers');

const app = express();
const server = http.createServer(app);

const io = socketIo(server, {
    cors: {
        origin: "https://node.amies.dev",
        methods: ["GET", "POST"]
    }
});

const port = process.env.PORT || 3000;
const dataFilePath = path.join(__dirname, 'data.json');

// Initialize data service
const dataService = new DataService(dataFilePath);

// Authentication middleware
const authenticate = (req, res, next) => {
    const credentials = auth(req);
    
    const validUsername = process.env.ADMIN_USERNAME;
    const validPassword = process.env.ADMIN_PASSWORD;
    
    if (!credentials || credentials.name !== validUsername || credentials.pass !== validPassword) {
        res.statusCode = 401;
        res.setHeader('WWW-Authenticate', 'Basic realm="Admin Panel"');
        res.end('Access denied');
    } else {
        next();
    }
};

// Routes
app.get('/', authenticate, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res, next) => {
    res.setHeader(
        'Content-Security-Policy',
        "frame-ancestors 'self' https://embed.twitch.tv https://*.twitch.tv https://node.amies.dev; " +
        "frame-src 'self' https://embed.twitch.tv https://*.twitch.tv https://player.twitch.tv; " +
        "media-src 'self' https://*.twitch.tv https://*.ttvnw.net"
    );
    next();
});

app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        port: port,
        env: process.env.NODE_ENV || 'development'
    });
});

// Socket handling
const socketHandlers = createSocketHandlers(io, dataService);
io.on('connection', socketHandlers.handleConnection);

// Start server
dataService.loadData().then(() => {
    server.listen(port, '0.0.0.0', () => {
        console.log(`Soldier Showdown Admin server listening on port ${port}`);
        console.log(`Server accessible at http://0.0.0.0:${port}`);
        console.log(`Using Cloudflare for SSL termination`);
    });
});
