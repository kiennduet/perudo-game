const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')));

let players = [];
let game = { bid: { count: 0, face: 0, pIdx: -1 }, turn: 0, active: false, logs: [] };

io.on('connection', (socket) => {
    // Khi người chơi tham gia hoặc quay lại sau khi refresh
    socket.on('join', (name) => {
        let p = players.find(player => player.name === name);
        if (p) {
            p.id = socket.id; // Cập nhật ID mới cho người cũ
        } else if (!game.active && players.length < 10) {
            players.push({ id: socket.id, name, dice: [], alive: true });
        }
        sync();
    });

    socket.on('start', () => {
        if (players.length >= 2) {
            game.active = true;
            game.logs = ["--- TRÒ CHƠI BẮT ĐẦU ---"];
            players.forEach(p => p.dice = [0,0,0,0,0]); // Khởi tạo 5 xúc xắc
            newRound();
        }
    });

    socket.on('bid', (data) => {
        if (!game.active || players[game.turn].id !== socket.id) return;
        if (isValid(data)) {
            game.bid = { ...data, pIdx: game.turn };
            game.logs.push(`${players[game.turn].name}: ${data.count} con [${data.face}]`);
            nextTurn();
            sync();
        }
    });

    socket.on('liar', () => {
        if (!game.active || game.bid.count === 0 || players[game.turn].id !== socket.id) return;
        
        const total = players.reduce((s, p) => s + p.dice.filter(d => d === game.bid.face || d === 1).length, 0);
        const isLiar = total < game.bid.count;
        const loserIdx = isLiar ? game.bid.pIdx : game.turn;
        
        game.logs.push(`Kết quả: có ${total} con [${game.bid.face}] (gồm cả Joker 1)`);
        game.logs.push(`${players[loserIdx].name} thua 1 xúc xắc!`);
        
        players[loserIdx].dice.pop();
        if (players[loserIdx].dice.length === 0) players[loserIdx].alive = false;

        if (players.filter(p => p.alive).length <= 1) {
            game.logs.push(`🏆 ${players.find(p => p.alive).name} THẮNG CHUNG CUỘC!`);
            game.active = false;
        } else {
            game.turn = loserIdx;
            if (!players[game.turn].alive) nextTurn();
            newRound();
        }
        sync(true); // Hiện xúc xắc sau khi hạ bài
    });

    function newRound() {
        players.forEach(p => {
            if (p.alive) p.dice = p.dice.map(() => Math.floor(Math.random() * 6) + 1);
        });
        game.bid = { count: 0, face: 0, pIdx: -1 };
        sync();
    }

    function nextTurn() {
        do { game.turn = (game.turn + 1) % players.length; } while (!players[game.turn].alive);
    }

    function isValid(b) {
        if (b.face < 2 || b.face > 6 || b.count <= 0) return false;
        if (game.bid.count === 0) return true;
        return (b.count > game.bid.count) || (b.count === game.bid.count && b.face > game.bid.face);
    }

    function sync(showAll = false) {
        players.forEach(p => {
            const masked = players.map(pl => ({
                name: pl.name, alive: pl.alive, count: pl.dice.length,
                dice: (showAll || pl.id === p.id || !game.active) ? pl.dice : []
            }));
            io.to(p.id).emit('update', { players: masked, game, me: p.id });
        });
    }
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, '0.0.0.0', () => console.log('Server running'));