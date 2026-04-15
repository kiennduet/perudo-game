// const express = require('express');
// const app = express();
// const http = require('http').createServer(app);
// const io = require('socket.io')(http);
// const path = require('path');

// app.use(express.static(path.join(__dirname, 'public')));

// let users = {}; 
// let players = []; 
// let game = { 
//     active: false, 
//     bid: { count: 0, face: 0, pIdx: -1 }, 
//     turn: 0, 
//     logs: [], 
//     showingResults: false,
//     aceUsed: false // BIẾN THEO DÕI ACE
// };

// io.on('connection', (socket) => {
//     socket.on('login', ({ username, password }) => {
//         if (!username || !password) return socket.emit('err', 'Nhập đủ user/pass!');
//         const name = username.trim();
//         if (!users[name]) users[name] = password;
//         else if (users[name] !== password) return socket.emit('err', 'Sai mật khẩu!');

//         let p = players.find(x => x.name === name);
//         if (p) { p.id = socket.id; p.online = true; } 
//         else {
//             if (game.active) return socket.emit('err', 'Game đang chạy!');
//             players.push({ id: socket.id, name: name, dice: [], alive: true, online: true });
//         }
//         socket.emit('loginSuccess', name);
//         sync();
//     });

//     socket.on('start', () => {
//         if (players.filter(p => p.online).length < 2) return socket.emit('err', 'Cần 2 người!');
//         game.active = true;
//         game.showingResults = false;
//         game.turn = 0;
//         game.bid = { count: 0, face: 0, pIdx: -1 };
//         game.aceUsed = false; // Reset Ace
//         game.logs = ["--- BẮT ĐẦU VÁN MỚI ---"];
//         players.forEach(p => { p.alive = p.online; p.dice = p.alive ? [0,0,0,0,0] : []; });
//         newRound();
//         sync();
//     });

//     socket.on('bid', (data) => {
//         const p = players[game.turn];
//         if (!game.active || game.showingResults || !p || p.id !== socket.id) return;
        
//         // CHẶN THẦU SAI
//         if (data.face === 1 && game.aceUsed) return socket.emit('err', 'Mặt Ace đã được dùng ở vòng này rồi!');
        
//         if (isValidBid(data)) {
//             if (data.face === 1) game.aceUsed = true; // Đánh dấu đã dùng Ace
//             game.bid = { count: data.count, face: data.face, pIdx: game.turn };
//             game.logs.push(`${p.name}: ${data.count} con [${data.face === 1 ? 'Ace' : data.face}]`);
//             nextTurn();
//             sync();
//         } else {
//             socket.emit('err', 'Số lượng hoặc mặt không hợp lệ!');
//         }
//     });

//     socket.on('liar', () => {
//         const p = players[game.turn];
//         if (!game.active || game.bid.count === 0 || game.showingResults || !p || p.id !== socket.id) return;
        
//         const face = game.bid.face;
//         const total = players.reduce((s, pl) => s + pl.dice.filter(d => d === face || d === 1).length, 0);
//         const isLiar = total < game.bid.count;
//         const loserIdx = isLiar ? game.bid.pIdx : game.turn;
        
//         game.showingResults = true;
//         game.logs.push(`Hạ bài: Có ${total} con [${face===1?'Ace':face}]`);
//         players[loserIdx].dice.pop();
//         if (players[loserIdx].dice.length === 0) players[loserIdx].alive = false;

//         if (players.filter(p => p.alive).length <= 1) {
//             game.active = false;
//             game.logs.push(`🏆 THẮNG: ${players.find(p => p.alive)?.name}`);
//         } else {
//             game.turn = loserIdx;
//             if (!players[game.turn].alive) nextTurn();
//         }
//         sync(true);
//     });

//     socket.on('nextRound', () => {
//         if (!game.active) return;
//         game.showingResults = false;
//         game.aceUsed = false; // Reset Ace cho vòng mới
//         newRound();
//         sync();
//     });

//     function isValidBid(nB) {
//         const oB = game.bid;
//         if (nB.face < 1 || nB.face > 6 || nB.count <= 0) return false;
//         if (oB.count === 0) return nB.face !== 1; // Không được mở màn bằng Ace

//         // LUẬT CHUYỂN ĐỔI CHUẨN
//         if (oB.face !== 1 && nB.face !== 1) {
//             return (nB.count > oB.count) || (nB.count === oB.count && nB.face > oB.face);
//         } else if (oB.face !== 1 && nB.face === 1) {
//             return nB.count >= Math.ceil(oB.count / 2); // Thường sang Ace: Chia 2
//         } else if (oB.face === 1 && nB.face !== 1) {
//             return nB.count >= (oB.count * 2 + 1); // Ace sang Thường: x2 + 1
//         }
//         return false; // Ace sang Ace bị chặn bởi biến aceUsed ở trên
//     }

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
//         players.forEach(p => {
//             const data = players.map(pl => ({
//                 name: pl.name, alive: pl.alive, count: pl.dice.length, online: pl.online,
//                 dice: (showAll || game.showingResults || pl.id === p.id || !game.active) ? pl.dice : []
//             }));
//             io.to(p.id).emit('update', { players: data, game, me: p.name });
//         });
//     }

//     socket.on('movePlayer', ({index, direction}) => {
//         if (game.active) return;
//         const newIndex = index + direction;
//         if (newIndex >= 0 && newIndex < players.length) {
//             [players[index], players[newIndex]] = [players[newIndex], players[index]];
//             sync();
//         }
//     });

//     socket.on('resetRoom', () => {
//         players = []; users = {}; game.active = false; game.logs = []; 
//         io.emit('reloadAll');
//     });

//     socket.on('disconnect', () => {
//         let p = players.find(x => x.id === socket.id);
//         if (p) p.online = false;
//         sync();
//     });
// });

// http.listen(process.env.PORT || 3000, '0.0.0.0');


const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')));

let users = {}; 
let players = []; 
let game = { 
    active: false, 
    bid: { count: 0, face: 0, pIdx: -1 }, 
    turn: 0, 
    logs: [], 
    showingResults: false, 
    aceUsed: false,
    mode: "Classic" // Mặc định
};

const MODE_DESC = {
    "Classic": "Luật quốc tế: Ace (mặt 1) là Joker. Có thể thầu Ace để giảm số lượng (chia 2), hoặc từ Ace về mặt thường (x2+1). Mỗi vòng chỉ được nhảy Ace 1 lần.",
    "Simple": "Dành cho người mới: Ace chỉ là mặt 1 bình thường, không có Joker. Ai thầu số lượng cao hơn hoặc mặt cao hơn là thắng. Không có luật nhảy Ace.",
    "FixedFace": "Cực khó: Khi người đầu tiên thầu mặt nào (ví dụ mặt 4), cả vòng đó chỉ được phép tăng số lượng con [4], không được đổi sang mặt khác."
};

function validateRules(nB, oB, mode, aceUsed) {
    if (nB.face < 1 || nB.face > 6 || nB.count <= 0) return false;
    if (oB.count === 0) return nB.face !== 1; // Phát súng đầu không Ace

    if (mode === "Classic") {
        if (nB.face === 1 && aceUsed) return false;
        if (oB.face !== 1 && nB.face !== 1) {
            return (nB.count > oB.count) || (nB.count === oB.count && nB.face > oB.face);
        } else if (oB.face !== 1 && nB.face === 1) {
            return nB.count >= Math.ceil(oB.count / 2);
        } else if (oB.face === 1 && nB.face !== 1) {
            return nB.count >= (oB.count * 2 + 1);
        }
    } else if (mode === "Simple") {
        return (nB.count > oB.count) || (nB.count === oB.count && nB.face > oB.face);
    } else if (mode === "FixedFace") {
        return (nB.count > oB.count) && (nB.face === oB.face);
    }
    return false;
}

io.on('connection', (socket) => {
    socket.on('login', ({ username, password }) => {
        const name = username.trim();
        if (!users[name]) users[name] = password;
        else if (users[name] !== password) return socket.emit('err', 'Sai mật khẩu!');
        let p = players.find(x => x.name === name);
        if (p) { p.id = socket.id; p.online = true; } 
        else {
            if (game.active) return socket.emit('err', 'Game đang chạy!');
            players.push({ id: socket.id, name: name, dice: [], alive: true, online: true });
        }
        socket.emit('loginSuccess', name);
        sync();
    });

    socket.on('changeMode', (newMode) => {
        if (game.active) return;
        game.mode = newMode;
        sync();
    });

    socket.on('start', () => {
        if (players.filter(p => p.online).length < 2) return;
        game.active = true;
        game.showingResults = false;
        game.aceUsed = false;
        game.bid = { count: 0, face: 0, pIdx: -1 };
        game.logs = [`--- BẮT ĐẦU: CHẾ ĐỘ ${game.mode.toUpperCase()} ---`];
        players.forEach(p => { p.alive = p.online; p.dice = p.alive ? [0,0,0,0,0] : []; });
        newRound();
        sync();
    });

    socket.on('bid', (data) => {
        const p = players[game.turn];
        if (!game.active || game.showingResults || p.id !== socket.id) return;
        if (validateRules(data, game.bid, game.mode, game.aceUsed)) {
            if (data.face === 1) game.aceUsed = true;
            game.bid = { count: data.count, face: data.face, pIdx: game.turn };
            game.logs.push(`${p.name}: ${data.count} con [${data.face === 1 ? 'Ace' : data.face}]`);
            nextTurn(); sync();
        } else { socket.emit('err', 'Thầu sai luật!'); }
    });

    socket.on('liar', () => {
        const p = players[game.turn];
        if (!game.active || game.bid.count === 0 || game.showingResults || p.id !== socket.id) return;
        const face = game.bid.face;
        const total = players.reduce((s, pl) => s + pl.dice.filter(d => d === face || (game.mode === "Classic" && d === 1)).length, 0);
        const isLiar = total < game.bid.count;
        const loserIdx = isLiar ? game.bid.pIdx : game.turn;
        game.showingResults = true;
        game.logs.push(`Hạ bài: Có ${total} con [${face===1?'Ace':face}]`);
        players[loserIdx].dice.pop();
        if (players[loserIdx].dice.length === 0) players[loserIdx].alive = false;
        if (players.filter(p => p.alive).length <= 1) game.active = false;
        else { game.turn = loserIdx; if (!players[game.turn].alive) nextTurn(); }
        sync(true);
    });

    socket.on('nextRound', () => {
        if (!game.active) return;
        game.showingResults = false; game.aceUsed = false; newRound(); sync();
    });

    socket.on('movePlayer', ({index, direction}) => {
        if (game.active) return;
        const nI = index + direction;
        if (nI >= 0 && nI < players.length) [players[index], players[nI]] = [players[nI], players[index]];
        sync();
    });

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
        players.forEach(p => {
            const data = players.map(pl => ({
                name: pl.name, alive: pl.alive, count: pl.dice.length, online: pl.online,
                dice: (showAll || game.showingResults || pl.id === p.id || !game.active) ? pl.dice : []
            }));
            io.to(p.id).emit('update', { players: data, game, modeDesc: MODE_DESC[game.mode] });
        });
    }
});

http.listen(process.env.PORT || 3000, '0.0.0.0');