
// const express = require('express');
// const app = express();
// const http = require('http').createServer(app);
// const io = require('socket.io')(http);
// const path = require('path');

// app.use(express.static(path.join(__dirname, 'public')));

// // ==========================================
// // MODULAR RULE ENGINE
// // ==========================================
// const MODES = {
//     "Classic": {
//         desc: "Aces are Wild. Bidding Aces: Halve count. Returning: Double + 1. Ace stacks allowed.",
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
//     "OneAce": {
//         desc: "Like Classic, but Aces can only be bid ONCE per round. Face is locked after use.",
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
//         desc: "Aces are just 1s. No Wilds. Higher quantity or face to continue.",
//         validate: (n, o) => (n.count > o.count) || (n.count === o.count && n.face > o.face),
//         count: (dicePool, face) => dicePool.filter(d => d === face).length
//     }
// };

// let users = {}; 
// let players = []; 
// let game = { active: false, bid: { count: 0, face: 0, pIdx: -1 }, turn: 0, logs: [], showingResults: false, mode: "Classic", aceUsed: false };

// io.on('connection', (socket) => {
//     socket.on('login', ({ username, password }) => {
//         const name = username.trim();
//         if (!users[name]) users[name] = password;
//         else if (users[name] !== password) return socket.emit('err', 'Wrong password!');
//         let p = players.find(x => x.name === name);
//         if (p) { p.id = socket.id; p.online = true; } 
//         else {
//             if (game.active) return socket.emit('err', 'Game in progress!');
//             players.push({ id: socket.id, name: name, dice: [], alive: true, online: true, ready: false });
//         }
//         socket.emit('loginSuccess', name);
//         sync();
//     });

//     socket.on('toggleReady', () => {
//         let p = players.find(x => x.id === socket.id);
//         if (!p) return;
//         p.ready = !p.ready;
//         const onlinePlayers = players.filter(pl => pl.online && (game.active ? pl.alive : true));
//         if (onlinePlayers.every(pl => pl.ready) && onlinePlayers.length >= 2) {
//             if (!game.active) startMatch();
//             else if (game.showingResults) nextRound();
//         }
//         sync();
//     });

//     function startMatch() {
//         game.active = true; game.showingResults = false; game.turn = 0; game.bid = { count: 0, face: 0, pIdx: -1 }; game.aceUsed = false;
//         game.logs = [`--- STARTING ${game.mode.toUpperCase()} ---`];
//         players.forEach(p => { p.alive = p.online; p.dice = p.alive ? [0,0,0,0,0] : []; p.ready = false; });
//         newRound();
//     }

//     function nextRound() {
//         game.showingResults = false; game.aceUsed = false;
//         players.forEach(p => p.ready = false);
//         newRound();
//         sync();
//     }

//     socket.on('bid', (data) => {
//         const p = players[game.turn];
//         if (!game.active || game.showingResults || p.id !== socket.id) return;
//         if (MODES[game.mode].validate(data, game.bid, game.aceUsed)) {
//             if (data.face === 1) game.aceUsed = true;
//             game.bid = { count: data.count, face: data.face, pIdx: game.turn };
//             game.logs.push(`${p.name}: ${data.count} x [${data.face === 1 ? 'Ace' : data.face}]`);
//             nextTurn(); sync();
//         } else { socket.emit('err', 'Invalid bid!'); }
//     });

//     socket.on('liar', () => {
//         const caller = players[game.turn];
//         if (!game.active || game.bid.count === 0 || game.showingResults || caller.id !== socket.id) return;
        
//         const bidder = players[game.bid.pIdx];
//         const allDice = players.reduce((a, b) => a.concat(b.dice), []);
//         const total = MODES[game.mode].count(allDice, game.bid.face);
//         const isLiar = total < game.bid.count;
        
//         const winner = isLiar ? caller : bidder;
//         const loser = isLiar ? bidder : caller;

//         game.showingResults = true;
//         players.forEach(pl => pl.ready = false);

//         game.logs.push(`--- CHALLENGE RESULTS ---`);
//         game.logs.push(`Bid was ${game.bid.count}x[${game.bid.face===1?'Ace':game.bid.face}]. Found ${total}.`);
//         game.logs.push(`⭐ ${winner.name.toUpperCase()} WINS THE CHALLENGE!`);
        
//         loser.dice.pop();
//         if (loser.dice.length === 0) {
//             loser.alive = false;
//             game.logs.push(`❌ ${loser.name.toUpperCase()} is ELIMINATED!`);
//         } else {
//             game.logs.push(`🔻 ${loser.name.toUpperCase()} lost 1 die. (${loser.dice.length} remaining)`);
//         }

//         if (players.filter(p => p.alive).length <= 1) {
//             game.active = false;
//             game.logs.push(`🏆 GAME OVER: ${players.find(p => p.alive)?.name.toUpperCase()} IS THE CHAMPION!`);
//         } else {
//             game.turn = players.indexOf(loser);
//             if (!players[game.turn].alive) nextTurn();
//         }
//         sync(true);
//     });

//     socket.on('changeMode', (m) => { if (!game.active && MODES[m]) { game.mode = m; sync(); } });
//     socket.on('resetRoom', () => { players = []; users = {}; game.active = false; io.emit('reloadAll'); });
//     socket.on('disconnect', () => { let p = players.find(x => x.id === socket.id); if (p) p.online = false; sync(); });

//     function newRound() {
//         players.forEach(p => { if(p.alive) p.dice = p.dice.map(() => Math.floor(Math.random()*6)+1); });
//         game.bid = { count: 0, face: 0, pIdx: -1 };
//     }
//     function nextTurn() {
//         let c = 0; do { game.turn = (game.turn + 1) % players.length; c++; } while (!players[game.turn].alive && c < 11);
//     }
//     function sync(showAll = false) {
//         const allModes = Object.keys(MODES); 
//         players.forEach(p => {
//             const data = players.map(pl => ({
//                 name: pl.name, alive: pl.alive, count: pl.dice.length, online: pl.online, ready: pl.ready,
//                 dice: (showAll || game.showingResults || pl.id === p.id || !game.active) ? pl.dice : []
//             }));
//             io.to(p.id).emit('update', { players: data, game, allModes, currentModeInfo: MODES[game.mode] });
//         });
//     }
// });

// http.listen(process.env.PORT || 3000, '0.0.0.0');

const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')));

const MODES = {
    "Classic": {
        desc: "Aces are Wild (Jokers). To bid Aces, halve previous quantity. To return to numbers, double + 1.",
        validate: (n, o, aceUsed) => {
            if (o.count === 0) return n.face !== 1;
            if (o.face !== 1 && n.face !== 1) return (n.count > o.count) || (n.count === o.count && n.face > o.face);
            if (o.face !== 1 && n.face === 1) return n.count >= Math.ceil(o.count / 2);
            if (o.face === 1 && n.face === 1) return n.count > o.count;
            if (o.face === 1 && n.face !== 1) return n.count >= (o.count * 2 + 1);
            return false;
        },
        count: (p, f) => p.filter(d => d === f || d === 1).length
    },
    "PowerAce": {
        desc: "Quantity Priority: New bid MUST have higher quantity. Aces can only be bid once per round.",
        validate: (n, o, aceUsed) => {
            if (n.face === 1 && aceUsed) return false;
            if (o.count === 0) return n.face !== 1;
            return n.count > o.count;
        },
        count: (p, f) => p.filter(d => d === f || d === 1).length
    },
    "NoJoker": {
        desc: "Pure Mode: Aces are just ones, NOT Wild. Higher quantity OR same quantity with higher face.",
        validate: (n, o) => (n.count > o.count) || (n.count === o.count && n.face > o.face),
        count: (p, f) => p.filter(d => d === f).length
    }
};

// Default color palette — cycles when player doesn't choose
const DEFAULT_COLORS = ['#ef4444','#3b82f6','#10b981','#f59e0b','#8b5cf6','#06b6d4','#f97316','#ec4899'];

let users = {};
let players = [];
let autoAdvanceTimer = null;
let winnerClearTimer = null;

let game = {
    active: false,
    bid: { count: 0, face: 0, pIdx: -1 },
    turn: 0,
    logs: [],
    showingResults: false,
    mode: "Classic",
    aceUsed: false,
    pendingLoserIdx: -1,
    pendingWinnerIdx: -1,
    winner: null,
    autoAdvanceAt: null,
    roundIdx: 0          // increments every newRound() — clients use this to trigger animations
};

const AUTO_ADVANCE_DELAY = 5000;

io.on('connection', (socket) => {

    // ── LOGIN ────────────────────────────────────────────────
    socket.on('login', ({ username, password, color }) => {
        const name = username.trim();
        if (!users[name]) users[name] = password;
        else if (users[name] !== password) return socket.emit('err', 'Wrong password!');

        let p = players.find(x => x.name === name);
        if (p) {
            p.id = socket.id;
            p.online = true;
            if (color) p.color = color; // allow color update on reconnect
        } else {
            if (game.active) return socket.emit('err', 'Match in progress!');
            const assignedColor = color || DEFAULT_COLORS[players.length % DEFAULT_COLORS.length];
            players.push({ id: socket.id, name, dice: [], alive: true, online: true, ready: false, color: assignedColor });
        }
        socket.emit('loginSuccess', name);
        sync();
    });

    // ── REORDER ──────────────────────────────────────────────
    socket.on('reorderPlayer', ({ index, direction }) => {
        if (game.active) return;
        const newIndex = index + direction;
        if (newIndex >= 0 && newIndex < players.length) {
            [players[index], players[newIndex]] = [players[newIndex], players[index]];
            sync();
        }
    });

    // ── KICK ─────────────────────────────────────────────────
    socket.on('kickPlayer', (targetName) => {
        const host = players.find(p => p.online);
        if (!host || host.id !== socket.id) return socket.emit('err', 'Only the host can kick!');
        const targetIdx = players.findIndex(p => p.name === targetName);
        if (targetIdx === -1) return;
        const target = players[targetIdx];

        if (target.online && target.id) io.to(target.id).emit('kicked', 'You were kicked by the host.');

        if (!game.active) {
            players.splice(targetIdx, 1);
            delete users[targetName];
        } else {
            target.alive = false; target.dice = []; target.online = false;
            game.logs.push(`🥾 ${target.name.toUpperCase()} KICKED!`);
            if (game.turn === targetIdx) nextTurn();
            const survivors = players.filter(p => p.alive);
            if (survivors.length <= 1) {
                clearTimeout(autoAdvanceTimer); autoAdvanceTimer = null;
                endGame(survivors[0] || null); sync(true); return;
            }
            if (game.showingResults) {
                clearTimeout(autoAdvanceTimer); autoAdvanceTimer = null;
                applyPenaltyAndNext();
            }
        }
        io.emit('chatMsg', { sender: '⚙️', text: `${targetName} was kicked.`, system: true });
        sync();
    });

    // ── CHAT ─────────────────────────────────────────────────
    socket.on('chatMsg', (text) => {
        const p = players.find(x => x.id === socket.id);
        if (!p) return;
        const clean = String(text).trim().slice(0, 120);
        if (!clean) return;
        io.emit('chatMsg', { sender: p.name, text: clean, color: p.color });
    });

    // ── READY ────────────────────────────────────────────────
    socket.on('toggleReady', () => {
        let p = players.find(x => x.id === socket.id);
        if (!p) return;
        p.ready = !p.ready;
        const currentActive = players.filter(pl => pl.online && (game.active ? pl.alive : true));
        if (currentActive.every(pl => pl.ready) && currentActive.length >= 2) {
            if (!game.active) startGame();
            else if (game.showingResults) { clearTimeout(autoAdvanceTimer); autoAdvanceTimer = null; applyPenaltyAndNext(); }
        }
        sync();
    });

    // ── BID ──────────────────────────────────────────────────
    socket.on('bid', (data) => {
        const p = players[game.turn];
        if (!game.active || game.showingResults || p.id !== socket.id) return;
        if (MODES[game.mode].validate(data, game.bid, game.aceUsed)) {
            if (data.face === 1) game.aceUsed = true;
            game.bid = { count: data.count, face: data.face, pIdx: game.turn };
            game.logs.push(`${p.name}: ${data.count} × [${data.face === 1 ? 'Ace' : data.face}]`);
            nextTurn(); sync();
        } else socket.emit('err', 'Invalid bid!');
    });

    // ── LIAR ─────────────────────────────────────────────────
    socket.on('liar', () => {
        const caller = players[game.turn];
        if (!game.active || game.bid.count === 0 || game.showingResults || caller.id !== socket.id) return;
        const bidder = players[game.bid.pIdx];
        const allDice = players.reduce((a, b) => a.concat(b.dice), []);
        const total = MODES[game.mode].count(allDice, game.bid.face);
        const isLiar = total < game.bid.count;
        const winner = isLiar ? caller : bidder;
        const loser = isLiar ? bidder : caller;

        game.showingResults = true;
        game.pendingLoserIdx = players.indexOf(loser);
        game.pendingWinnerIdx = players.indexOf(winner);
        game.autoAdvanceAt = Date.now() + AUTO_ADVANCE_DELAY;
        players.forEach(pl => pl.ready = false);
        game.logs.push(`--- CHALLENGE ---`);
        game.logs.push(`Bid: ${game.bid.count}×[${game.bid.face === 1 ? 'Ace' : game.bid.face}] | Found: ${total}`);
        game.logs.push(`⭐ ${winner.name.toUpperCase()} WON THE ROUND!`);

        autoAdvanceTimer = setTimeout(() => {
            autoAdvanceTimer = null;
            applyPenaltyAndNext();
            sync();
        }, AUTO_ADVANCE_DELAY);

        sync(true);
    });

    // ── MISC ─────────────────────────────────────────────────
    socket.on('changeMode', (m) => { if (!game.active && MODES[m]) { game.mode = m; sync(); } });
    socket.on('resetRoom', () => {
        clearTimeout(autoAdvanceTimer); clearTimeout(winnerClearTimer);
        players = []; users = {};
        Object.assign(game, { active: false, bid: { count: 0, face: 0, pIdx: -1 }, turn: 0, logs: [], showingResults: false, aceUsed: false, pendingLoserIdx: -1, pendingWinnerIdx: -1, winner: null, autoAdvanceAt: null, roundIdx: 0 });
        io.emit('reloadAll');
    });
    socket.on('disconnect', () => { let p = players.find(x => x.id === socket.id); if (p) p.online = false; sync(); });

    // ── HELPERS ──────────────────────────────────────────────
    function startGame() {
        game.active = true; game.showingResults = false; game.turn = 0;
        game.bid = { count: 0, face: 0, pIdx: -1 }; game.aceUsed = false; game.winner = null; game.autoAdvanceAt = null;
        game.logs = [`--- MODE: ${game.mode.toUpperCase()} ---`];
        players.forEach(pl => { pl.alive = pl.online; pl.dice = pl.alive ? [0,0,0,0,0] : []; pl.ready = false; });
        newRound();
    }

    function applyPenaltyAndNext() {
        game.showingResults = false; game.autoAdvanceAt = null;
        if (game.pendingLoserIdx !== -1) {
            const loser = players[game.pendingLoserIdx];
            loser.dice.pop();
            if (loser.dice.length === 0) { loser.alive = false; game.logs.push(`💀 ${loser.name.toUpperCase()} ELIMINATED!`); }
            game.turn = game.pendingLoserIdx;
            if (!players[game.turn].alive) { let c = 0; do { game.turn = (game.turn + 1) % players.length; c++; } while (!players[game.turn].alive && c < 12); }
        }
        const survivors = players.filter(p => p.alive);
        if (survivors.length <= 1) endGame(survivors[0] || null);
        else {
            game.aceUsed = false; game.pendingLoserIdx = -1; game.pendingWinnerIdx = -1;
            players.forEach(p => p.ready = false);
            newRound();
        }
    }

    function endGame(champion) {
        game.active = false; game.winner = champion?.name || null;
        game.showingResults = false; game.autoAdvanceAt = null;
        if (champion) game.logs.push(`🏆 CHAMPION: ${champion.name.toUpperCase()}`);
        sync();
        winnerClearTimer = setTimeout(() => {
            game.winner = null;
            players.forEach(p => { p.ready = false; if (p.online) { p.alive = true; p.dice = []; } });
            sync();
        }, 8000);
    }

    function newRound() {
        game.roundIdx++;
        players.forEach(p => { if (p.alive) p.dice = p.dice.map(() => Math.floor(Math.random() * 6) + 1); });
        game.bid = { count: 0, face: 0, pIdx: -1 };
    }

    function nextTurn() {
        let c = 0;
        do { game.turn = (game.turn + 1) % players.length; c++; }
        while (!players[game.turn].alive && c < 12);
    }

    function sync(showAll = false) {
        const onlinePlayers = players.filter(p => p.online);
        const hostName = onlinePlayers.length > 0 ? onlinePlayers[0].name : null;
        const allModes = Object.keys(MODES);
        players.forEach(p => {
            if (!p.id) return;
            const data = players.map((pl, idx) => ({
                name: pl.name, alive: pl.alive, count: pl.dice.length,
                online: pl.online, ready: pl.ready,
                color: pl.color,     // ← color included
                isRoundWinner: (game.showingResults && idx === game.pendingWinnerIdx),
                isRoundLoser:  (game.showingResults && idx === game.pendingLoserIdx),
                dice: (showAll || game.showingResults || pl.id === p.id || !game.active) ? pl.dice : []
            }));
            io.to(p.id).emit('update', { players: data, game, allModes, currentModeInfo: MODES[game.mode], hostName });
        });
    }
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, '0.0.0.0');