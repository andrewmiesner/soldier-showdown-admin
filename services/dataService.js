const fs = require('fs').promises;
const path = require('path');

class DataService {
    constructor(dataFilePath) {
        this.dataFilePath = dataFilePath;
        this.dataStore = {
            streams: [],
            selectedStreams: [],
            casters: [],
            leaderboard: Array(8).fill().map(() => ({ name: '', score: 0 })),
            message: ''
        };
    }

    // Ensure each caster has an id
    ensureCasterIds(casters) {
        return casters.map((caster, index) => ({
            id: caster.id || index,
            ...caster
        }));
    }

    async loadData() {
        try {
            const data = await fs.readFile(this.dataFilePath, 'utf8');
            console.log('Raw data loaded from file:', data);
            const loadedData = JSON.parse(data);
            console.log('Parsed data:', loadedData);
            
            this.dataStore = {
                streams: Array.isArray(loadedData.streams) ? loadedData.streams : [],
                casters: Array.isArray(loadedData.casters) ? this.ensureCasterIds(loadedData.casters) : [],
                leaderboard: Array.isArray(loadedData.leaderboard) ? loadedData.leaderboard : Array(8).fill().map(() => ({ name: "", score: 0 })),
                message: loadedData.message || "",
                selectedStreams: Array.isArray(loadedData.selectedStreams) ? loadedData.selectedStreams : []
            };
            
            console.log('Processed dataStore:', this.dataStore);
            console.log('[DataService] Data loaded from file');
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.log('[DataService] No existing data file, starting with empty data');
                await this.saveData();
            } else {
                console.error('Error reading data file:', error);
            }
        }
    }

    async saveData() {
        try {
            const dataToSave = JSON.stringify(this.dataStore, null, 2);
            await fs.writeFile(this.dataFilePath, dataToSave);
            console.log('[DataService] Data saved to file');
        } catch (error) {
            console.error('Error writing data file:', error);
        }
    }

    getData() {
        return this.dataStore;
    }

    updateData(updates) {
        this.dataStore = { ...this.dataStore, ...updates };
    }

    // Specific update methods
    addStream(stream) {
        this.dataStore.streams.push(stream);
    }

    updateStream(streamData) {
        const streamIndex = this.dataStore.streams.findIndex(s => s.id === streamData.id);
        if (streamIndex !== -1) {
            this.dataStore.streams[streamIndex] = streamData;
        }
    }

    removeStream(streamId) {
        this.dataStore.streams = this.dataStore.streams.filter(s => s.id !== streamId);
        this.dataStore.selectedStreams = this.dataStore.selectedStreams.map(id => id === streamId ? null : id);
    }

    updateCaster(id, casterData) {
        const casterIndex = this.dataStore.casters.findIndex(c => c.id === id);
        if (casterIndex !== -1) {
            this.dataStore.casters[casterIndex] = { ...this.dataStore.casters[casterIndex], ...casterData };
        } else {
            this.dataStore.casters.push({ id, ...casterData });
        }
    }

    updateLeaderboard(leaderboardData) {
        this.dataStore.leaderboard = leaderboardData;
    }

    updateMessage(message) {
        this.dataStore.message = message;
    }

    updateSelectedStream(slot, streamId) {
        if (slot >= 0 && slot < 3) {
            this.dataStore.selectedStreams[slot] = streamId;
        }
    }
}

module.exports = DataService;