const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')));

// Lưu trữ tài khoản và trạng thái game
let users = {}; // { username: password }
let players = []; // Danh sách người chơi trong phòng
let game = { 
    active: false, 
    bid: { count: 0, face: 0, pIdx: -1 }, 
    turn: 0, 
    logs: [], 
    showingResults: false 
};

io.on('connection', (socket) => {
    // Xử lý đăng nhập / Đăng ký
    socket.on('login', ({ username, password }) => {
        if (!username || !password) return socket.emit('err', 'Thiếu thông tin!');
        
        // Nếu user chưa tồn tại -> Đăng ký. Nếu tồn tại -> Kiểm tra pass
        if (!users[username]) {
            users[username] = password;
        } else if (users[username] !== password) {
            return socket.emit('err', 'Sai mật khẩu!');
        }

        // Tìm xem người này đã có trong danh sách players chưa (xử lý rớt mạng)
        let p = players.find(x => x.name === username);
        if (p) {
            p.id = socket.id;
            p.online = true;
        } else {
            if (game.active) return socket.emit('err', 'Game đang chạy, đợi ván sau!');
            if (players.length >= 10) return socket.emit('err', 'Phòng đầy!');
            players.push({ id: socket.id, name: username, dice: [], alive: true, online: true });
        }

        socket.emit('loginSuccess', username);
        sync();
    });

    socket.on('start', () => {
        if (players.length < 2) return;
        players.forEach(p => { p.alive = true; p.dice = [0,0,0,0,0]; });
        game.active = true;
        game.showingResults = false;
        game.turn = 0;
        game.bid = { count: 0, face: 0, pIdx: -1 };
        game.logs = ["--- TRÒ CHƠI BẮT ĐẦU ---"];
        newRound();
        sync();
    });

    socket.on('bid', (data) => {
        const p = players[game.turn];
        if (!game.active || game.showingResults || p.id !== socket.id) return;
        
        if (isValidBid(data)) {
            game.bid = { count: data.count, face: data.face, pIdx: game.turn };
            game.logs.push(`${p.name}: ${data.count} con [${data.face === 1 ? 'Ace' : data.face}]`);
            nextTurn();
            sync();
        }
    });

    socket.on('liar', () => {
        if (!game.active || game.bid.count === 0 || game.showingResults || players[game.turn].id !== socket.id) return;
        
        const face = game.bid.face;
        const total = players.reduce((s, p) => s + p.dice.filter(d => d === face || d === 1).length, 0);
        const isLiar = total < game.bid.count;
        const loserIdx = isLiar ? game.bid.pIdx : game.turn;
        
        game.showingResults = true;
        game.logs.push(`Hạ bài: Có ${total} con [${face===1?'Ace':face}] (gồm cả 1)`);
        players[loserIdx].dice.pop();
        
        if (players[loserIdx].dice.length === 0) {
            players[loserIdx].alive = false;
            game.logs.push(`${players[loserIdx].name} BỊ LOẠI!`);
        } else {
            game.logs.push(`${players[loserIdx].name} thua! Còn ${players[loserIdx].dice.length} 🎲`);
        }

        const survivors = players.filter(p => p.alive);
        if (survivors.length <= 1) {
            game.active = false;
            game.logs.push(`🏆 CHIẾN THẮNG: ${survivors[0].name}`);
        } else {
            game.turn = loserIdx;
            if (!players[game.turn].alive) nextTurn();
        }
        sync(true);
    });

    socket.on('nextRound', () => {
        if (!game.active) return;
        game.showingResults = false;
        newRound();
        sync();
    });

    socket.on('resetRoom', () => {
        players = []; users = {}; game.active = false; game.logs = []; 
        io.emit('reloadAll');
    });

    socket.on('disconnect', () => {
        let p = players.find(x => x.id === socket.id);
        if (p) p.online = false;
        sync();
    });

    function isValidBid(nB) {
        const oB = game.bid;
        if (nB.face < 1 || nB.face > 6 || nB.count <= 0) return false;
        if (oB.count === 0) return true;
        if (oB.face !== 1 && nB.face !== 1) return (nB.count > oB.count) || (nB.count === oB.count && nB.face > oB.face);
        if (oB.face !== 1 && nB.face === 1) return nB.count >= Math.ceil(oB.count / 2);
        if (oB.face === 1 && nB.face !== 1) return nB.count >= (oB.count * 2 + 1);
        return nB.count > oB.count;
    }

    function newRound() {
        players.forEach(p => { if(p.alive) p.dice = p.dice.map(() => Math.floor(Math.random()*6)+1); });
        game.bid = { count: 0, face: 0, pIdx: -1 };
    }

    function nextTurn() {
        let attempts = 0;
        do { game.turn = (game.turn + 1) % players.length; attempts++; } 
        while (!players[game.turn].alive && attempts < 10);
    }

    function sync(showAll = false) {
        players.forEach(p => {
            const data = players.map(pl => ({
                name: pl.name, alive: pl.alive, count: pl.dice.length, online: pl.online,
                dice: (showAll || game.showingResults || pl.id === p.id || !game.active) ? pl.dice : []
            }));
            io.to(p.id).emit('update', { players: data, game, me: p.name });
        });
    }
});

http.listen(process.env.PORT || 3000, '0.0.0.0');