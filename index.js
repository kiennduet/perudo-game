
// const express = require('express');
// const app = express();
// const http = require('http').createServer(app);
// const io = require('socket.io')(http);
// const path = require('path');

// app.use(express.static(path.join(__dirname, 'public')));

// // ==========================================
// // MODULAR RULE ENGINE - SETTINGS
// // ==========================================
// const MODES = {
//     "Classic": {
//         desc: "Standard Rules: Aces (1s) are Wild. Bidding Aces: Halve the count. Returning from Aces: Double + 1. Re-bidding Aces is allowed.",
//         validate: (n, o, aceUsed) => {
//             if (o.count === 0) return n.face !== 1;
//             if (o.face !== 1 && n.face !== 1) return (n.count > o.count) || (n.count === o.count && n.face > o.face);
//             if (o.face !== 1 && n.face === 1) return n.count >= Math.ceil(o.count / 2);
//             if (o.face === 1 && n.face === 1) return n.count > o.count;
//             if (o.face === 1 && n.face !== 1) return n.count >= (o.count * 2 + 1);
//             return false;
//         },
//         count: (dicePool, face) => dicePool.filter(d => d === face || d === 1).length
//     },
//     "PowerAce": {
//         desc: "Quantity Priority: New bid must have a higher quantity than the previous one, regardless of face. Aces can be bid only once per round.",
//         validate: (n, o, aceUsed) => {
//             if (n.face === 1 && aceUsed) return false;
//             if (o.count === 0) return n.face !== 1;
//             return n.count > o.count;
//         },
//         count: (dicePool, face) => dicePool.filter(d => d === face || d === 1).length
//     },
//     "OneAce": {
//         desc: "Limited Aces: Similar to Classic, but Aces can only be bid once per round. Once bid, the Ace face is locked.",
//         validate: (n, o, aceUsed) => {
//             if (n.face === 1 && aceUsed) return false;
//             if (o.count === 0) return n.face !== 1;
//             if (o.face !== 1 && n.face !== 1) return (n.count > o.count) || (n.count === o.count && n.face > o.face);
//             if (o.face !== 1 && n.face === 1) return n.count >= Math.ceil(o.count / 2);
//             if (o.face === 1 && n.face !== 1) return n.count >= (o.count * 2 + 1);
//             return false;
//         },
//         count: (dicePool, face) => dicePool.filter(d => d === face || d === 1).length
//     },
//     "NoJoker": {
//         desc: "Pure Dice: Aces are just ones. No Wilds. Higher quantity or higher face to continue the bidding.",
//         validate: (n, o) => (n.count > o.count) || (n.count === o.count && n.face > o.face),
//         count: (dicePool, face) => dicePool.filter(d => d === face).length
//     }
// };

// let users = {}; 
// let players = [];
// let game = { 
//     active: false, 
//     bid: { count: 0, face: 0, pIdx: -1 }, 
//     turn: 0, 
//     logs: [], 
//     showingResults: false, 
//     mode: "Classic", 
//     aceUsed: false 
// };

// io.on('connection', (socket) => {
//     socket.on('login', ({ username, password }) => {
//         const name = username.trim();
//         if (!users[name]) users[name] = password;
//         else if (users[name] !== password) return socket.emit('err', 'Invalid password!');
        
//         let p = players.find(x => x.name === name);
//         if (p) {
//             p.id = socket.id;
//             p.online = true;
//         } else {
//             if (game.active) return socket.emit('err', 'Game in progress! Please wait for the next match.');
//             players.push({ id: socket.id, name: name, dice: [], alive: true, online: true });
//         }
//         socket.emit('loginSuccess', name);
//         sync();
//     });

//     socket.on('changeMode', (m) => {
//         if (!game.active && MODES[m]) {
//             game.mode = m;
//             sync();
//         }
//     });

//     socket.on('start', () => {
//         if (players.filter(p => p.online).length < 2) return socket.emit('err', 'Need at least 2 online players!');
//         game.active = true;
//         game.showingResults = false;
//         game.turn = 0;
//         game.bid = { count: 0, face: 0, pIdx: -1 };
//         game.aceUsed = false;
//         game.logs = [`--- MODE: ${game.mode.toUpperCase()} ---`];
//         players.forEach(p => {
//             p.alive = p.online;
//             p.dice = p.alive ? [0,0,0,0,0] : [];
//         });
//         newRound();
//         sync();
//     });

//     socket.on('bid', (data) => {
//         const p = players[game.turn];
//         if (!game.active || game.showingResults || !p || p.id !== socket.id) return;
        
//         if (MODES[game.mode].validate(data, game.bid, game.aceUsed)) {
//             if (data.face === 1) game.aceUsed = true;
//             game.bid = { count: data.count, face: data.face, pIdx: game.turn };
//             game.logs.push(`${p.name} bid: ${data.count} x [${data.face === 1 ? 'Ace' : data.face}]`);
//             nextTurn();
//             sync();
//         } else {
//             socket.emit('err', 'Invalid bid for ' + game.mode + ' mode!');
//         }
//     });

//     socket.on('liar', () => {
//         const p = players[game.turn];
//         if (!game.active || game.bid.count === 0 || game.showingResults || !p || p.id !== socket.id) return;
        
//         const allDice = players.reduce((a, b) => a.concat(b.dice), []);
//         const total = MODES[game.mode].count(allDice, game.bid.face);
//         const isLiar = total < game.bid.count;
//         const loserIdx = isLiar ? game.bid.pIdx : game.turn;
        
//         game.showingResults = true;
//         game.logs.push(`Showdown: Found ${total} x [${game.bid.face === 1 ? 'Ace' : game.bid.face}]`);
        
//         players[loserIdx].dice.pop();
//         if (players[loserIdx].dice.length === 0) {
//             players[loserIdx].alive = false;
//             game.logs.push(`${players[loserIdx].name} has been ELIMINATED!`);
//         } else {
//             game.logs.push(`${players[loserIdx].name} lost 1 dice!`);
//         }

//         if (players.filter(p => p.alive).length <= 1) {
//             game.active = false;
//             game.logs.push(`🏆 WINNER: ${players.find(p => p.alive)?.name}`);
//         } else {
//             game.turn = loserIdx;
//             if (!players[game.turn].alive) nextTurn();
//         }
//         sync(true);
//     });

//     socket.on('nextRound', () => {
//         if (game.active) {
//             game.showingResults = false;
//             game.aceUsed = false;
//             newRound();
//             sync();
//         }
//     });

//     socket.on('movePlayer', ({ index, direction }) => {
//         if (!game.active) {
//             const nI = index + direction;
//             if (nI >= 0 && nI < players.length) {
//                 [players[index], players[nI]] = [players[nI], players[index]];
//                 sync();
//             }
//         }
//     });

//     socket.on('resetRoom', () => {
//         players = [];
//         users = {};
//         game.active = false;
//         io.emit('reloadAll');
//     });

//     socket.on('disconnect', () => {
//         let p = players.find(x => x.id === socket.id);
//         if (p) p.online = false;
//         sync();
//     });

//     function newRound() {
//         players.forEach(p => { if(p.alive) p.dice = p.dice.map(() => Math.floor(Math.random()*6)+1); });
//         game.bid = { count: 0, face: 0, pIdx: -1 };
//     }

//     function nextTurn() {
//         let count = 0;
//         do { game.turn = (game.turn + 1) % players.length; count++; } 
//         while (!players[game.turn].alive && count < 11);
//     }

//     function sync(showAll = false) {
//         const allModes = Object.keys(MODES); 
//         players.forEach(p => {
//             const data = players.map(pl => ({
//                 name: pl.name, alive: pl.alive, count: pl.dice.length, online: pl.online,
//                 dice: (showAll || game.showingResults || pl.id === p.id || !game.active) ? pl.dice : []
//             }));
//             io.to(p.id).emit('update', { 
//                 players: data, 
//                 game, 
//                 allModes: allModes,
//                 currentModeInfo: MODES[game.mode]
//             });
//         });
//     }
// });

// const PORT = process.env.PORT || 3000;
// http.listen(PORT, '0.0.0.0', () => console.log('Perudo Server running on port', PORT));


const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// MODULAR RULE ENGINE (ENGLISH)
// ==========================================
const MODES = {
    "Classic": {
        desc: "Standard Rules: Aces are Wild. Bidding Aces: Halve the count. Returning from Aces: Double + 1.",
        validate: (n, o, aceUsed) => {
            if (o.count === 0) return n.face !== 1;
            if (o.face !== 1 && n.face !== 1) return (n.count > o.count) || (n.count === o.count && n.face > o.face);
            if (o.face !== 1 && n.face === 1) return n.count >= Math.ceil(o.count / 2);
            if (o.face === 1 && n.face === 1) return n.count > o.count;
            if (o.face === 1 && n.face !== 1) return n.count >= (o.count * 2 + 1);
            return false;
        },
        count: (dicePool, face) => dicePool.filter(d => d === face || d === 1).length
    },
    "PowerAce": {
        desc: "Quantity First: New bid must have a higher quantity. Aces used only once per round.",
        validate: (n, o, aceUsed) => {
            if (n.face === 1 && aceUsed) return false;
            if (o.count === 0) return n.face !== 1;
            return n.count > o.count;
        },
        count: (dicePool, face) => dicePool.filter(d => d === face || d === 1).length
    },
    "NoJoker": {
        desc: "Beginner: Aces are just 1s. No Wilds. Higher quantity or face to continue.",
        validate: (n, o) => (n.count > o.count) || (n.count === o.count && n.face > o.face),
        count: (dicePool, face) => dicePool.filter(d => d === face).length
    }
};

let users = {}; 
let players = []; 
let game = { active: false, bid: { count: 0, face: 0, pIdx: -1 }, turn: 0, logs: [], showingResults: false, mode: "Classic", aceUsed: false };

io.on('connection', (socket) => {
    socket.on('login', ({ username, password }) => {
        const name = username.trim();
        if (!users[name]) users[name] = password;
        else if (users[name] !== password) return socket.emit('err', 'Wrong password!');
        
        let p = players.find(x => x.name === name);
        if (p) { p.id = socket.id; p.online = true; } 
        else {
            if (game.active) return socket.emit('err', 'Game in progress!');
            players.push({ id: socket.id, name: name, dice: [], alive: true, online: true, ready: false });
        }
        socket.emit('loginSuccess', name);
        sync();
    });

    // TÍNH NĂNG READY
    socket.on('toggleReady', () => {
        let p = players.find(x => x.id === socket.id);
        if (!p) return;
        p.ready = !p.ready;

        // Kiểm tra nếu tất cả đã sẵn sàng
        const onlinePlayers = players.filter(pl => pl.online && (game.active ? pl.alive : true));
        const allReady = onlinePlayers.every(pl => pl.ready);

        if (allReady && onlinePlayers.length >= 2) {
            if (!game.active) startMatch();
            else if (game.showingResults) nextRound();
        }
        sync();
    });

    function startMatch() {
        game.active = true;
        game.showingResults = false;
        game.turn = 0;
        game.bid = { count: 0, face: 0, pIdx: -1 };
        game.aceUsed = false;
        game.logs = [`--- MODE: ${game.mode.toUpperCase()} ---`];
        players.forEach(p => {
            p.alive = p.online;
            p.dice = p.alive ? [0,0,0,0,0] : [];
            p.ready = false; // Reset ready cho lượt Liar tiếp theo
        });
        newRound();
    }

    function nextRound() {
        game.showingResults = false;
        game.aceUsed = false;
        players.forEach(p => p.ready = false);
        newRound();
        sync();
    }

    socket.on('bid', (data) => {
        const p = players[game.turn];
        if (!game.active || game.showingResults || p.id !== socket.id) return;
        if (MODES[game.mode].validate(data, game.bid, game.aceUsed)) {
            if (data.face === 1) game.aceUsed = true;
            game.bid = { count: data.count, face: data.face, pIdx: game.turn };
            game.logs.push(`${p.name} bid: ${data.count} x [${data.face === 1 ? 'Ace' : data.face}]`);
            nextTurn(); sync();
        } else { socket.emit('err', 'Invalid bid!'); }
    });

    socket.on('liar', () => {
        const p = players[game.turn];
        if (!game.active || game.bid.count === 0 || game.showingResults || p.id !== socket.id) return;
        const allDice = players.reduce((a, b) => a.concat(b.dice), []);
        const total = MODES[game.mode].count(allDice, game.bid.face);
        const isLiar = total < game.bid.count;
        const loserIdx = isLiar ? game.bid.pIdx : game.turn;
        
        game.showingResults = true;
        players.forEach(pl => pl.ready = false); // Yêu cầu mọi người Ready để sang ván mới
        game.logs.push(`Showdown: Found ${total} x [${game.bid.face===1?'Ace':game.bid.face}]`);
        
        players[loserIdx].dice.pop();
        if (players[loserIdx].dice.length === 0) players[loserIdx].alive = false;

        if (players.filter(p => p.alive).length <= 1) {
            game.active = false;
            game.logs.push(`🏆 WINNER: ${players.find(p => p.alive)?.name}`);
        } else {
            game.turn = loserIdx;
            if (!players[game.turn].alive) nextTurn();
        }
        sync(true);
    });

    socket.on('changeMode', (m) => { if (!game.active && MODES[m]) { game.mode = m; sync(); } });
    socket.on('resetRoom', () => { players = []; users = {}; game.active = false; io.emit('reloadAll'); });
    socket.on('disconnect', () => { let p = players.find(x => x.id === socket.id); if (p) p.online = false; sync(); });

    function newRound() {
        players.forEach(p => { if(p.alive) p.dice = p.dice.map(() => Math.floor(Math.random()*6)+1); });
        game.bid = { count: 0, face: 0, pIdx: -1 };
    }
    function nextTurn() {
        let c = 0; do { game.turn = (game.turn + 1) % players.length; c++; } while (!players[game.turn].alive && c < 11);
    }
    function sync(showAll = false) {
        const allModes = Object.keys(MODES); 
        players.forEach(p => {
            const data = players.map(pl => ({
                name: pl.name, alive: pl.alive, count: pl.dice.length, online: pl.online, ready: pl.ready,
                dice: (showAll || game.showingResults || pl.id === p.id || !game.active) ? pl.dice : []
            }));
            io.to(p.id).emit('update', { players: data, game, allModes, currentModeInfo: MODES[game.mode] });
        });
    }
});

http.listen(process.env.PORT || 3000, '0.0.0.0');