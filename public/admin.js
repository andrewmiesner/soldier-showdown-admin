// Define createStore function
const createStore = (initialState) => {
    let state = initialState;
    const listeners = [];

    return {
        getState: () => state,
        setState: (newState) => {
            state = { ...state, ...newState };
            listeners.forEach(listener => listener(state));
        },
        subscribe: (listener) => {
            listeners.push(listener);
            return () => {
                const index = listeners.indexOf(listener);
                if (index > -1) {
                    listeners.splice(index, 1);
                }
            };
        },
        dispatch: (action) => {
            state = store.reducer(state, action);
            listeners.forEach(listener => listener(state));
        },
        reducer: (state, action) => {
            // This will be overwritten later
            return state;
        }
    };
};

// Initialize the store
const store = createStore({
    streams: [],
    selectedStreams: [],
    casters: [], // Change this to an empty array
    leaderboard: [],
    message: ''
});

// Socket connection
const socket = io();

// Utility functions
const log = message => console.log(`[Client] ${message}`);
const generateUUID = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
});

// Event handlers
const handleInitialState = state => {
    log('Received initial state');
    store.setState(state);
};

const handleUpdate = update => {
    log(`Received update: ${update.type}`);
    switch (update.type) {
        case 'ADD_STREAM':
            store.setState({ streams: [...store.state.streams, update.data] });
            break;
        case 'REMOVE_STREAM':
            const newStreams = store.state.streams.filter(s => s.id !== update.data.id);
            const newSelectedStreams = store.state.selectedStreams.map(id => 
                id === update.data.id ? null : id
            );
            store.setState({ 
                streams: newStreams,
                selectedStreams: newSelectedStreams
            });
            break;
        case 'UPDATE_SELECTED_STREAM':
            const updatedSelectedStreams = [...store.state.selectedStreams];
            updatedSelectedStreams[update.data.slot] = update.data.streamId;
            store.setState({ selectedStreams: updatedSelectedStreams });
            break;
        // ... other cases ...
    }
};

// Define update functions
const updateStreamsDisplay = () => {
    const streamsDiv = document.getElementById('streams');
    streamsDiv.innerHTML = store.getState().streams.map((stream, index) => `
        <div class="bg-dark-600 p-2 rounded-lg flex justify-between items-center">
            <div>
                <span class="font-semibold text-blue-300">${stream.playerName}</span>
                <span class="text-xs text-gray-400">(${stream.platform})</span>
            </div>
            <button data-stream-id="${stream.id}" class="remove-stream bg-red-600 text-white px-2 py-1 rounded text-xs hover:bg-red-700">Remove</button>
        </div>
    `).join('');

    // Add event listeners to remove buttons
    document.querySelectorAll('.remove-stream').forEach(button => {
        button.addEventListener('click', (e) => {
            const streamId = e.target.getAttribute('data-stream-id');
            removeStream(streamId);
        });
    });

    // Update stream selectors
    updateStreamSelectors();
};

const updateStreamSelectors = () => {
    const selectors = document.querySelectorAll('.update-selected-stream');
    selectors.forEach((selector, index) => {
        selector.innerHTML = '<option value="">Select a stream</option>';
        store.getState().streams.forEach(stream => {
            const option = document.createElement('option');
            option.value = stream.id;
            option.textContent = `${stream.playerName} (${stream.platform})`;
            option.selected = store.getState().selectedStreams[index] === stream.id;
            selector.appendChild(option);
        });
    });
};

const updateCastersDisplay = () => {
  const casters = store.getState().casters;
  if (Array.isArray(casters) && casters.length > 0) {
    casters.forEach(caster => {
      const nameElement = document.getElementById(`casterName${caster.id}`);
      const handleElement = document.getElementById(`casterHandle${caster.id}`);
      
      if (nameElement) nameElement.value = caster.name || '';
      if (handleElement) handleElement.value = caster.handle || '';
    });
  } else {
    console.log('No casters to display or casters is not an array:', casters);
    // Optionally, clear or reset caster input fields here
  }
};

const updateLeaderboardDisplay = () => {
    const leaderboard = store.getState().leaderboard;
    if (Array.isArray(leaderboard)) {
        renderLeaderboard(leaderboard);
    } else {
        console.error('Leaderboard is not an array:', leaderboard);
        const leaderboardDiv = document.getElementById('leaderboard');
        leaderboardDiv.innerHTML = '<p>Error: Leaderboard data is invalid.</p>';
    }
};

const updateMessageDisplay = () => {
    const messageElement = document.getElementById('messageContent');
    if (messageElement) {
        messageElement.value = store.getState().message || '';
    } else {
        console.warn('Message element not found');
    }
};

// Define the main update function
const updateDisplay = () => {
    log('Updating display');
    updateStreamsDisplay();
    updateStreamSelectors();
    updateCastersDisplay();
    updateLeaderboardDisplay();
    updateMessageDisplay();
};

const updateEntireLeaderboard = () => {
    const updatedLeaderboard = Array.from({ length: 8 }, (_, index) => ({
        name: document.getElementById(`leaderboardName${index}`)?.value || '',
        score: parseInt(document.getElementById(`leaderboardScore${index}`)?.value) || 0
    }));

    // Send the update to the server
    socket.emit('update', { 
        type: 'UPDATE_LEADERBOARD', 
        data: updatedLeaderboard 
    });

    // Update local store
    store.dispatch({
        type: 'UPDATE_LEADERBOARD',
        data: updatedLeaderboard
    });
};

const updateLeaderboardPlayer = (index, name, score) => {
    const updatedLeaderboard = store.getState().leaderboard.map((player, i) => 
        i === index ? { ...player, name, score: parseInt(score) } : player
    );

    // Send the update to the server
    socket.emit('update', { 
        type: 'UPDATE_LEADERBOARD', 
        data: updatedLeaderboard 
    });

    // Update local store
    store.dispatch({
        type: 'UPDATE_LEADERBOARD',
        data: updatedLeaderboard
    });
};

// Set up the store's reducer
store.reducer = (state, action) => {
    switch (action.type) {
        case 'SET_INITIAL_STATE':
            return { ...state, ...action.data };
        case 'ADD_STREAM':
            return { ...state, streams: [...state.streams, action.data] };
        case 'UPDATE_STREAM':
            return {
                ...state,
                streams: state.streams.map(stream => 
                    stream.id === action.data.id ? action.data : stream
                )
            };
        case 'REMOVE_STREAM':
            return {
                ...state,
                streams: state.streams.filter(stream => stream.id !== action.data),
                selectedStreams: state.selectedStreams.map(id => id === action.data ? null : id)
            };
        case 'UPDATE_CASTER':
            return {
                ...state,
                casters: state.casters.map(caster => 
                    caster.id === action.data.id ? { ...caster, ...action.data.caster } : caster
                )
            };
        case 'UPDATE_LEADERBOARD':
            return { ...state, leaderboard: action.data };
        case 'UPDATE_MESSAGE':
            return { ...state, message: action.data };
        case 'UPDATE_SELECTED_STREAM':
            const newSelectedStreams = [...state.selectedStreams];
            newSelectedStreams[action.data.slot] = action.data.streamId;
            return { ...state, selectedStreams: newSelectedStreams };
        default:
            return state;
    }
};

// Set up socket connection and event listeners
socket.on('initialState', (initialState) => {
    store.dispatch({ type: 'SET_INITIAL_STATE', data: initialState });
});

socket.on('update', (update) => {
    store.dispatch(update);
});

// Subscribe to store changes
store.subscribe(updateDisplay);

// Action creators
const addStream = () => {
    const playerName = document.getElementById('playerName').value.trim();
    const platform = document.getElementById('platform').value;
    const channelId = document.getElementById('channelId').value.trim();

    if (!playerName || !platform || !channelId) {
        alert('Please fill in all fields');
        return;
    }

    const stream = {
        id: generateUUID(),
        playerName,
        platform,
        channelId
    };
    log(`Adding stream: ${JSON.stringify(stream)}`);
    socket.emit('update', { type: 'ADD_STREAM', data: stream });

    // Clear input fields after adding
    document.getElementById('playerName').value = '';
    document.getElementById('platform').value = '';
    document.getElementById('channelId').value = '';
};

const removeStream = (streamId) => {
    log(`Removing stream: ${streamId}`);
    socket.emit('update', { type: 'REMOVE_STREAM', data: streamId });
};

const updateCaster = (id) => {
  const caster = {
    id: id,
    name: document.getElementById(`casterName${id}`).value,
    handle: document.getElementById(`casterHandle${id}`).value
  };
  log(`Updating caster with ID ${id}: ${JSON.stringify(caster)}`);
  socket.emit('update', { type: 'UPDATE_CASTER', data: { id, caster } });
};

const updateLeaderboard = (slot) => {
    const player = {
        name: document.getElementById(`leaderboardName${slot}`).value,
        score: parseInt(document.getElementById(`leaderboardScore${slot}`).value) || 0
    };
    log(`Updating leaderboard at slot ${slot}: ${JSON.stringify(player)}`);
    socket.emit('update', { type: 'UPDATE_LEADERBOARD', data: { slot, player } });
};

const updateMessage = () => {
    const message = document.getElementById('messageContent').value;
    log(`Updating message: ${message}`);
    socket.emit('update', { type: 'UPDATE_MESSAGE', data: message });
};

const updateSelectedStream = (slot) => {
    const streamId = document.getElementById(`selectedStream${slot}`).value;
    log(`Updating selected stream at slot ${slot}: ${streamId}`);
    socket.emit('update', { type: 'UPDATE_SELECTED_STREAM', data: { slot, streamId } });
};

// Initialize
const init = () => {
    // Add event listeners
    document.getElementById('addStreamButton').addEventListener('click', addStream);
    document.querySelectorAll('.update-caster').forEach(button => {
        button.addEventListener('click', (e) => {
            const id = parseInt(e.target.getAttribute('data-caster-id'));
            updateCaster(id);
        });
    });
    document.getElementById('updateMessageButton').addEventListener('click', updateMessage);
    document.querySelectorAll('.update-selected-stream').forEach(select => {
        select.addEventListener('change', (e) => {
            const slot = e.target.getAttribute('data-stream-slot');
            updateSelectedStream(parseInt(slot));
        });
    });
};

document.addEventListener('DOMContentLoaded', () => {
    init();
    updateDisplay();
});

function renderLeaderboard(leaderboard) {
    const leaderboardDiv = document.getElementById('leaderboard');
    leaderboardDiv.innerHTML = '';
    
    leaderboard.forEach((player, index) => {
        const playerDiv = document.createElement('div');
        playerDiv.className = 'flex gap-3 p-3 bg-dark-700 rounded-lg';
        playerDiv.innerHTML = `
            <div class="w-8 flex items-center justify-center text-slate-400 font-medium">${index + 1}</div>
            <input type="text" 
                   value="${player.name}" 
                   placeholder="Player Name" 
                   class="flex-1 min-w-0 p-2 bg-dark-700 border border-slate-600 rounded text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-yellow-500 focus:border-transparent text-sm"
                   onchange="updateLeaderboardPlayer(${index}, this.value, document.querySelector('#leaderboard .flex:nth-child(${index + 1}) input[type=number]').value)">
            <input type="number" 
                   value="${player.score}" 
                   placeholder="Score" 
                   class="w-20 min-w-0 p-2 bg-dark-700 border border-slate-600 rounded text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-yellow-500 focus:border-transparent text-sm"
                   onchange="updateLeaderboardPlayer(${index}, document.querySelector('#leaderboard .flex:nth-child(${index + 1}) input[type=text]').value, this.value)">
        `;
        leaderboardDiv.appendChild(playerDiv);
    });
}