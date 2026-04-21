const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')));
app.use('/audio', express.static(path.join(__dirname, 'audio')));

const MODES = {
    "Classic": {
        desc: "Aces are Wild. First bid must be 2-6. To Aces: Halve quantity (round up). From Aces: Double quantity + 1.",
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
    "Palifico": {
        desc: "Classic Ace rules. One Ace bid per round. Palifico: First time any player reaches 1 die — that round, face is locked after opening bid; all players can only raise the count.",
        validate: (n, o, aceUsed) => {
            // Called only when palificoActive is FALSE (palifico validation is handled separately in bid handler)
            if (o.count === 0) return n.face !== 1;
            if (n.face === 1) {
                if (aceUsed) return false;
                return n.count >= Math.ceil(o.count / 2);
            }
            if (o.face === 1) return n.count >= (o.count * 2 + 1);
            return (n.count > o.count) || (n.count === o.count && n.face > o.face);
        },
        count: (p, f) => p.filter(d => d === f || d === 1).length
    },
    "NoJoker": {
        desc: "Pure Mode: Aces are just ones, NOT Wild. Higher quantity OR same quantity with higher face.",
        validate: (n, o) => (n.count > o.count) || (n.count === o.count && n.face > o.face),
        count: (p, f) => p.filter(d => d === f).length
    }
};

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
    roundIdx: 0,
    // ── Palifico state ──────────────────────────────────
    palificoActive: false      // true only during the active palifico round
};

const AUTO_ADVANCE_DELAY = 10000;

io.on('connection', (socket) => {

    // ── LOGIN ────────────────────────────────────────────────
    socket.on('login', ({ username, password, color }) => {
        const name = username.trim();
        if (!users[name]) users[name] = password;
        else if (users[name] !== password) return socket.emit('err', 'Wrong password!');
        let p = players.find(x => x.name === name);
        if (p) { p.id = socket.id; p.online = true; if (color) p.color = color; }
        else {
            if (game.active) return socket.emit('err', 'Match in progress!');
            const assignedColor = color || DEFAULT_COLORS[players.length % DEFAULT_COLORS.length];
            players.push({ id: socket.id, name, dice: [], alive: true, online: true, ready: false, color: assignedColor, palificoUsed: false });
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
            else if (game.showingResults) {
                clearTimeout(autoAdvanceTimer); autoAdvanceTimer = null;
                applyPenaltyAndNext();
            }
        }
        sync();
    });

    // ── BID ──────────────────────────────────────────────────
    socket.on('bid', (data) => {
        const p = players[game.turn];
        if (!game.active || game.showingResults || p.id !== socket.id) return;

        let valid = false;

        if (game.palificoActive) {
            // ── PALIFICO RULES ───────────────────────────────
            // The player with 1 die opens and locks the face for the round.
            // Everyone else can only increase count, face stays locked.
            // Aces (face=1) are forbidden as opening bid.
            if (game.bid.count === 0) {
                // Opening bid: set the face (no aces allowed)
                valid = data.face !== 1 && data.count >= 1;
            } else {
                // Subsequent bids: same face mandatory, count must strictly increase
                valid = data.face === game.bid.face && data.count > game.bid.count;
            }
        } else {
            valid = MODES[game.mode].validate(data, game.bid, game.aceUsed);
        }

        if (valid) {
            if (data.face === 1) game.aceUsed = true;
            game.bid = { count: data.count, face: data.face, pIdx: game.turn };
            game.logs.push(`${p.name}: ${data.count} × [${data.face === 1 ? 'Ace' : data.face}]`);
            nextTurn(); sync();
        } else {
            socket.emit('err', 'Invalid bid!');
        }
    });

    // ── LIAR ─────────────────────────────────────────────────
    socket.on('liar', () => {
        const caller = players[game.turn];
        if (!game.active || game.bid.count === 0 || game.showingResults || caller.id !== socket.id) return;
        const bidder = players[game.bid.pIdx];
        const allDice = players.reduce((a, b) => a.concat(b.dice), []);

        // During palifico: aces are NOT wild (face must match exactly)
        const countFn = game.palificoActive
            ? (pool, face) => pool.filter(d => d === face).length
            : MODES[game.mode].count;

        const total = countFn(allDice, game.bid.face);
        const isLiar = total < game.bid.count;
        const winner = isLiar ? caller : bidder;
        const loser  = isLiar ? bidder : caller;

        game.showingResults = true;
        game.pendingLoserIdx = players.indexOf(loser);
        game.pendingWinnerIdx = players.indexOf(winner);
        game.autoAdvanceAt = Date.now() + AUTO_ADVANCE_DELAY;
        players.forEach(pl => pl.ready = false);

        game.logs.push(`--- CHALLENGE ---`);
        game.logs.push(`Bid: ${game.bid.count}×[${game.bid.face === 1 ? 'Ace' : game.bid.face}] | Found: ${total}${game.palificoActive ? ' (Palifico — no wilds)' : ''}`);
        game.logs.push(`⭐ ${winner.name.toUpperCase()} WON THE ROUND!`);

        autoAdvanceTimer = setTimeout(() => {
            autoAdvanceTimer = null;
            applyPenaltyAndNext();
            sync();
        }, AUTO_ADVANCE_DELAY);

        sync(true);
    });

    // ── MISC ─────────────────────────────────────────────────
    // ── SOUND BROADCAST ──────────────────────────────────
    let lastSoundAt = 0;
    socket.on('playSound', (file) => {
        const p = players.find(x => x.id === socket.id);
        if (!p) return;
        const now = Date.now();
        if (now - lastSoundAt < 3000) return;
        lastSoundAt = now;
        const safe = String(file).replace(/[^a-zA-Z0-9_\-\.]/g, '');
        io.emit('playSound', { file: safe, sender: p.name });
    });

    socket.on('changeMode', (m) => { if (!game.active && MODES[m]) { game.mode = m; sync(); } });
    socket.on('resetRoom', () => {
        clearTimeout(autoAdvanceTimer); clearTimeout(winnerClearTimer);
        players = []; users = {};
        Object.assign(game, {
            active: false, bid: { count: 0, face: 0, pIdx: -1 }, turn: 0, logs: [],
            showingResults: false, aceUsed: false, pendingLoserIdx: -1, pendingWinnerIdx: -1,
            winner: null, autoAdvanceAt: null, roundIdx: 0,
            palificoActive: false
        });
        io.emit('reloadAll');
    });
    socket.on('disconnect', () => { let p = players.find(x => x.id === socket.id); if (p) p.online = false; sync(); });

    // ── HELPERS ──────────────────────────────────────────────
    function startGame() {
        game.active = true; game.showingResults = false; game.turn = 0;
        game.bid = { count: 0, face: 0, pIdx: -1 };
        game.aceUsed = false; game.winner = null; game.autoAdvanceAt = null;
        game.palificoActive = false;
        game.logs = [`--- MODE: ${game.mode.toUpperCase()} ---`];
        players.forEach(pl => { pl.alive = pl.online; pl.dice = pl.alive ? [0,0,0,0,0] : []; pl.ready = false; pl.palificoUsed = false; });
        newRound();
    }

    function applyPenaltyAndNext() {
        game.showingResults = false;
        game.autoAdvanceAt = null;

        // Determine if NEXT round should be palifico (set before calling newRound)
        let nextRoundIsPalifico = false;

        if (game.pendingLoserIdx !== -1) {
            const loser = players[game.pendingLoserIdx];
            loser.dice.pop();

            if (loser.dice.length === 0) {
                loser.alive = false;
                game.logs.push(`💀 ${loser.name.toUpperCase()} ELIMINATED!`);
            } else if (
                loser.dice.length === 1 &&
                !loser.palificoUsed &&
                game.mode === 'Palifico'
            ) {
                // ── Palifico trigger (per-player, once each) ─
                nextRoundIsPalifico = true;
                loser.palificoUsed = true;
                game.logs.push(`🎯 PALIFICO! ${loser.name.toUpperCase()} has 1 die — face locks this round!`);
            }

            game.turn = game.pendingLoserIdx;
            if (!players[game.turn].alive) {
                let c = 0;
                do { game.turn = (game.turn + 1) % players.length; c++; }
                while (!players[game.turn].alive && c < 12);
            }
        }

        const survivors = players.filter(p => p.alive);
        if (survivors.length <= 1) {
            endGame(survivors[0] || null);
        } else {
            game.aceUsed = false;
            game.pendingLoserIdx = -1;
            game.pendingWinnerIdx = -1;
            game.palificoActive = nextRoundIsPalifico; // apply for coming round; false resets it
            players.forEach(p => p.ready = false);
            newRound();
        }
    }

    function endGame(champion) {
        game.active = false; game.winner = champion?.name || null;
        game.showingResults = false; game.autoAdvanceAt = null; game.palificoActive = false;
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
                online: pl.online, ready: pl.ready, color: pl.color, palificoUsed: pl.palificoUsed,
                isRoundWinner: (game.showingResults && idx === game.pendingWinnerIdx),
                isRoundLoser:  (game.showingResults && idx === game.pendingLoserIdx),
                dice: (showAll || game.showingResults || pl.id === p.id || !game.active || !p.alive) ? pl.dice : []
            }));
            io.to(p.id).emit('update', { players: data, game, allModes, currentModeInfo: MODES[game.mode], hostName });
        });
    }
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, '0.0.0.0');