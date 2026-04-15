const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')));

let players = [];
let game = { bid: { count: 0, face: 0, pIdx: -1 }, turn: 0, active: false, logs: [] };

io.on('connection', (socket) => {
  socket.on('join', (name) => {
    if (players.length < 10 && !game.active) {
      players.push({ id: socket.id, name: name || "Người chơi " + (players.length + 1), dice: [], alive: true });
      sync();
    }
  });

  socket.on('start', () => {
    if (players.length >= 2) { 
      game.active = true; 
      game.logs = ["--- TRÒ CHƠI BẮT ĐẦU ---"];
      newRound(); 
    }
  });

  socket.on('bid', (data) => {
    if (!game.active || players[game.turn].id !== socket.id) return;
    if (isValid(data)) {
      game.bid = { ...data, pIdx: game.turn };
      game.logs.push(`${players[game.turn].name} thầu: ${data.count} con [${data.face}]`);
      nextTurn();
      sync();
    }
  });

  socket.on('liar', () => {
    if (!game.active || game.bid.count === 0 || players[game.turn].id !== socket.id) return;
    
    // Tính tổng số lượng mặt đã thầu + số lượng mặt 1 (Joker)
    const total = players.reduce((s, p) => s + p.dice.filter(d => d === game.bid.face || d === 1).length, 0);
    const isLiar = total < game.bid.count;
    const loserIdx = isLiar ? game.bid.pIdx : game.turn;
    
    game.logs.push(`--- KIỂM TRA: Có ${total} con [${game.bid.face}] ---`);
    game.logs.push(`${players[loserIdx].name} thua 1 xúc xắc!`);
    
    players[loserIdx].dice.pop();
    if (players[loserIdx].dice.length === 0) {
      players[loserIdx].alive = false;
      game.logs.push(`${players[loserIdx].name} ĐÃ BỊ LOẠI!`);
    }

    // Kiểm tra xem còn mấy người chơi
    const survivors = players.filter(p => p.alive);
    if (survivors.length <= 1) {
      game.logs.push(`🏆 ${survivors[0].name} LÀ NGƯỜI CHIẾN THẮNG!`);
      game.active = false;
      sync(true); // Show hết kết quả
    } else {
      game.turn = loserIdx;
      if (!players[game.turn].alive) nextTurn();
      newRound();
    }
  });

  socket.on('disconnect', () => {
    const pIdx = players.findIndex(p => p.id === socket.id);
    if (pIdx !== -1) {
      game.logs.push(`${players[pIdx].name} đã rời phòng.`);
      players.splice(pIdx, 1);
      if (players.length < 2) {
        game.active = false;
        game.logs.push("Không đủ người chơi, game dừng.");
      } else if (game.turn >= players.length) {
        game.turn = 0;
      }
      sync();
    }
  });

  function newRound() {
    players.forEach(p => { 
      if (p.alive) p.dice = Array.from({length: p.dice.length || 5}, () => Math.floor(Math.random()*6)+1); 
    });
    game.bid = { count: 0, face: 0, pIdx: -1 };
    sync(true); // Show xúc xắc để mọi người đối chiếu kết quả ván vừa rồi
  }

  function nextTurn() {
    let count = 0;
    do { 
      game.turn = (game.turn + 1) % players.length; 
      count++;
    } while (!players[game.turn].alive && count < 10);
  }

  function isValid(b) {
    if (b.face < 2 || b.face > 6) return false; // Thầu từ mặt 2-6 (mặt 1 là Joker)
    if (game.bid.count === 0) return true;
    // Luật: Tăng số lượng HOẶC giữ số lượng nhưng tăng mặt
    return (b.count > game.bid.count) || (b.count === game.bid.count && b.face > game.bid.face);
  }

  function sync(showAll = false) {
    if (game.logs.length > 15) game.logs.shift(); // Giới hạn log cho đỡ lag
    players.forEach(p => {
      const maskedPlayers = players.map(pl => ({
        name: pl.name, alive: pl.alive, count: pl.dice.length,
        dice: (showAll || pl.id === p.id) ? pl.dice : []
      }));
      io.to(p.id).emit('update', { players: maskedPlayers, game, me: p.id });
    });
  }
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, '0.0.0.0', () => console.log('Server running on port ' + PORT));