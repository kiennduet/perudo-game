// const express = require('express');
// const app = express();
// const http = require('http').createServer(app);
// const io = require('socket.io')(http);
// const path = require('path');

// app.use(express.static(path.join(__dirname, 'public')));

// let players = [];
// let game = { bid: { count: 0, face: 0, pIdx: -1 }, turn: 0, active: false, logs: [] };

// io.on('connection', (socket) => {
//     socket.on('join', (name) => {
//         let p = players.find(x => x.name === name);
//         if (p) { p.id = socket.id; } 
//         else if (!game.active) {
//             players.push({ id: socket.id, name, dice: [], alive: true });
//         }
//         sync();
//     });

//     socket.on('resetRoom', () => {
//         players = []; // Xóa sạch mảng người chơi
//         game = { 
//             bid: { count: 0, face: 0, pIdx: -1 }, 
//             turn: 0, 
//             active: false, 
//             logs: ["--- PHÒNG ĐÃ ĐƯỢC LÀM MỚI ---"] 
//         };
//         io.emit('roomReset'); // Thông báo cho tất cả mọi người
//         console.log("Phòng đã được Reset");
//     });

//     socket.on('start', () => {
//         if (players.length < 2) return;
//         game.active = true;
//         game.logs = ["--- VÁN MỚI BẮT ĐẦU ---"];
//         players.forEach(p => { if(p.alive) p.dice = [0,0,0,0,0]; });
//         newRound();
//     });

//     socket.on('bid', (data) => {
//         const p = players[game.turn];
//         if (!game.active || p.id !== socket.id) return;
        
//         if (isValidBid(data)) {
//             game.bid = { count: data.count, face: data.face, pIdx: game.turn };
//             game.logs.push(`${p.name} thầu: ${data.count} con [${data.face === 1 ? 'Ace' : data.face}]`);
//             do { game.turn = (game.turn + 1) % players.length; } while (!players[game.turn].alive);
//             sync();
//         }
//     });

//     socket.on('liar', () => {
//         if (!game.active || game.bid.count === 0 || players[game.turn].id !== socket.id) return;
        
//         const face = game.bid.face;
//         let total = 0;
        
//         if (face === 1) {
//             // Khi thầu Ace, chỉ tính mặt 1
//             total = players.reduce((s, p) => s + p.dice.filter(d => d === 1).length, 0);
//         } else {
//             // Khi thầu mặt thường, tính mặt đó + mặt 1 (Joker)
//             total = players.reduce((s, p) => s + p.dice.filter(d => d === face || d === 1).length, 0);
//         }

//         const isLiar = total < game.bid.count;
//         const loserIdx = isLiar ? game.bid.pIdx : game.turn;
        
//         game.logs.push(`Hạ bài: Có ${total} con [${face===1?'Ace':face}]`);
//         game.logs.push(`${players[loserIdx].name} thua! Mất 1 xúc xắc.`);
        
//         players[loserIdx].dice.pop();
//         if (players[loserIdx].dice.length === 0) players[loserIdx].alive = false;

//         if (players.filter(p => p.alive).length <= 1) {
//             game.logs.push(`🏆 ${players.find(p => p.alive).name} THẮNG CUỘC!`);
//             game.active = false;
//         } else {
//             game.turn = loserIdx;
//             if (!players[game.turn].alive) {
//                 do { game.turn = (game.turn + 1) % players.length; } while (!players[game.turn].alive);
//             }
//             newRound();
//         }
//         sync(true);
//     });

//     function isValidBid(newB) {
//         const oldB = game.bid;
//         const n = newB.count;
//         const f = newB.face;

//         if (f < 1 || f > 6 || n <= 0) return false;
//         if (oldB.count === 0) return true; // Thầu đầu tiên ván

//         const oldN = oldB.count;
//         const oldF = oldB.face;

//         // Luật chuyển đổi Ace
//         if (oldF !== 1 && f !== 1) {
//             // Thường -> Thường
//             return (n > oldN) || (n === oldN && f > oldF);
//         } else if (oldF !== 1 && f === 1) {
//             // Thường -> Ace (Ít nhất 1/2)
//             return n >= Math.ceil(oldN / 2);
//         } else if (oldF === 1 && f !== 1) {
//             // Ace -> Thường (Ít nhất gấp đôi + 1)
//             return n >= (oldN * 2 + 1);
//         } else if (oldF === 1 && f === 1) {
//             // Ace -> Ace
//             return n > oldN;
//         }
//         return false;
//     }

//     function newRound() {
//         players.forEach(p => { if(p.alive) p.dice = p.dice.map(() => Math.floor(Math.random()*6)+1); });
//         game.bid = { count: 0, face: 0, pIdx: -1 };
//         sync();
//     }

//     function sync(showAll = false) {
//         players.forEach(p => {
//             const data = players.map(pl => ({
//                 name: pl.name, alive: pl.alive, count: pl.dice.length,
//                 dice: (showAll || pl.id === p.id || !game.active) ? pl.dice : []
//             }));
//             io.to(p.id).emit('update', { players: data, game, me: p.id });
//         });
//     }
// });

// const PORT = process.env.PORT || 3000;
// http.listen(PORT, '0.0.0.0');


const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')));

let players = [];
let game = { bid: { count: 0, face: 0, pIdx: -1 }, turn: 0, active: false, logs: [], showingResults: false };

io.on('connection', (socket) => {
    socket.on('join', (name) => {
        let p = players.find(x => x.name === name);
        if (p) { p.id = socket.id; } 
        else if (!game.active && players.length < 10) {
            players.push({ id: socket.id, name, dice: [], alive: true });
        }
        sync();
    });

    // Tính năng mới: Thay đổi thứ tự
    socket.on('movePlayer', ({index, direction}) => {
        if (game.active) return;
        const newIndex = index + direction;
        if (newIndex >= 0 && newIndex < players.length) {
            const temp = players[index];
            players[index] = players[newIndex];
            players[newIndex] = temp;
            sync();
        }
    });

    socket.on('start', () => {
        if (players.length < 2) return;
        game.active = true;
        game.showingResults = false;
        game.logs = ["--- TRÒ CHƠI BẮT ĐẦU ---"];
        players.forEach(p => { if(p.alive) p.dice = [0,0,0,0,0]; });
        newRound();
    });

    socket.on('bid', (data) => {
        if (!game.active || game.showingResults || players[game.turn].id !== socket.id) return;
        if (isValidBid(data)) {
            game.bid = { ...data, pIdx: game.turn };
            game.logs.push(`${players[game.turn].name}: ${data.count} con [${data.face === 1 ? 'Ace' : data.face}]`);
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
        
        game.showingResults = true; // Bật chế độ xem kết quả
        game.logs.push(`Hạ bài: Có ${total} con [${face===1?'Ace':face}]`);
        game.logs.push(`${players[loserIdx].name} thua!`);
        
        players[loserIdx].dice.pop();
        if (players[loserIdx].dice.length === 0) players[loserIdx].alive = false;
        
        // Thiết lập lượt cho ván sau là người vừa thua
        game.turn = loserIdx;
        if (!players[game.turn].alive) {
            do { game.turn = (game.turn + 1) % players.length; } while (!players[game.turn].alive);
        }

        // QUAN TRỌNG: Không gọi newRound() ở đây! 
        // Để nguyên xúc xắc cũ để mọi người đối chiếu.
        sync(true); 
    });

    socket.on('nextRound', () => {
        // Chỉ khi mọi người xem xong và bấm "Sẵn sàng", mới tung xúc xắc mới
        if (players.filter(p => p.alive).length <= 1) {
            game.active = false;
            game.showingResults = false;
            game.logs.push("🏆 TRÒ CHƠI KẾT THÚC!");
        } else {
            game.showingResults = false;
            newRound(); // Tung xúc xắc mới ở ĐÂY
            game.logs.push("--- VÒNG MỚI BẮT ĐẦU ---");
        }
        sync();
    });

    socket.on('resetRoom', () => {
        players = []; game.active = false; game.logs = []; sync();
    });

    function isValidBid(newB) {
        const oldB = game.bid;
        if (newB.face < 1 || newB.face > 6 || newB.count <= 0) return false;
        if (oldB.count === 0) return true;
        if (oldB.face !== 1 && newB.face !== 1) return (newB.count > oldB.count) || (newB.count === oldB.count && newB.face > oldB.face);
        if (oldB.face !== 1 && newB.face === 1) return newB.count >= Math.ceil(oldB.count / 2);
        if (oldB.face === 1 && newB.face !== 1) return newB.count >= (oldB.count * 2 + 1);
        return newB.count > oldB.count;
    }

    function newRound() {
        players.forEach(p => { if(p.alive) p.dice = p.dice.map(() => Math.floor(Math.random()*6)+1); });
        game.bid = { count: 0, face: 0, pIdx: -1 };
    }

    function nextTurn() {
        do { game.turn = (game.turn + 1) % players.length; } while (!players[game.turn].alive);
    }

    function sync(showAll = false) {
        players.forEach(p => {
            const masked = players.map(pl => ({
                name: pl.name, alive: pl.alive, count: pl.dice.length,
                dice: (showAll || game.showingResults || pl.id === p.id || !game.active) ? pl.dice : []
            }));
            io.to(p.id).emit('update', { players: masked, game, me: p.id });
        });
    }
});

http.listen(process.env.PORT || 3000, '0.0.0.0');