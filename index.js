
const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// MODULAR RULE ENGINE
// ==========================================
const MODES = {
    "Classic": {
        desc: "Aces are Wild. Bidding Aces: Halve count. Returning: Double + 1. Ace stacks allowed.",
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
    "OneAce": {
        desc: "Like Classic, but Aces can only be bid ONCE per round. Face is locked after use.",
        validate: (n, o, aceUsed) => {
            if (n.face === 1 && aceUsed) return false;
            if (o.count === 0) return n.face !== 1;
            if (o.face !== 1 && n.face !== 1) return (n.count > o.count) || (n.count === o.count && n.face > o.face);
            if (o.face !== 1 && n.face === 1) return n.count >= Math.ceil(o.count / 2);
            if (o.face === 1 && n.face !== 1) return n.count >= (o.count * 2 + 1);
            return false;
        },
        count: (dicePool, face) => dicePool.filter(d => d === face || d === 1).length
    },
    "NoJoker": {
        desc: "Aces are just 1s. No Wilds. Higher quantity or face to continue.",
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

    socket.on('toggleReady', () => {
        let p = players.find(x => x.id === socket.id);
        if (!p) return;
        p.ready = !p.ready;
        const onlinePlayers = players.filter(pl => pl.online && (game.active ? pl.alive : true));
        if (onlinePlayers.every(pl => pl.ready) && onlinePlayers.length >= 2) {
            if (!game.active) startMatch();
            else if (game.showingResults) nextRound();
        }
        sync();
    });

    function startMatch() {
        game.active = true; game.showingResults = false; game.turn = 0; game.bid = { count: 0, face: 0, pIdx: -1 }; game.aceUsed = false;
        game.logs = [`--- STARTING ${game.mode.toUpperCase()} ---`];
        players.forEach(p => { p.alive = p.online; p.dice = p.alive ? [0,0,0,0,0] : []; p.ready = false; });
        newRound();
    }

    function nextRound() {
        game.showingResults = false; game.aceUsed = false;
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
            game.logs.push(`${p.name}: ${data.count} x [${data.face === 1 ? 'Ace' : data.face}]`);
            nextTurn(); sync();
        } else { socket.emit('err', 'Invalid bid!'); }
    });

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
        players.forEach(pl => pl.ready = false);

        game.logs.push(`--- CHALLENGE RESULTS ---`);
        game.logs.push(`Bid was ${game.bid.count}x[${game.bid.face===1?'Ace':game.bid.face}]. Found ${total}.`);
        game.logs.push(`⭐ ${winner.name.toUpperCase()} WINS THE CHALLENGE!`);
        
        loser.dice.pop();
        if (loser.dice.length === 0) {
            loser.alive = false;
            game.logs.push(`❌ ${loser.name.toUpperCase()} is ELIMINATED!`);
        } else {
            game.logs.push(`🔻 ${loser.name.toUpperCase()} lost 1 die. (${loser.dice.length} remaining)`);
        }

        if (players.filter(p => p.alive).length <= 1) {
            game.active = false;
            game.logs.push(`🏆 GAME OVER: ${players.find(p => p.alive)?.name.toUpperCase()} IS THE CHAMPION!`);
        } else {
            game.turn = players.indexOf(loser);
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