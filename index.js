const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

// Chỉ định đường dẫn thư mục public rõ ràng
app.use(express.static(path.join(__dirname, 'public')));

let players = [];
let game = { bid: { count: 0, face: 0, pIdx: -1 }, turn: 0, active: false, logs: [] };

io.on('connection', (socket) => {
  console.log('Có người kết nối:', socket.id);

  socket.on('join', (name) => {
    if (players.length < 10 && !game.active) {
      players.push({ id: socket.id, name: name || "Vô danh", dice: [], alive: true });
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
    if (isValid(data)) {
      game.bid = { ...data, pIdx: game.turn };
      game.logs.push(`${players[game.turn].name}: ${data.count} con ${data.face}`);
      nextTurn();
      sync();
    }
  });

  socket.on('liar', () => {
    if (game.bid.count === 0) return;
    const total = players.reduce((s, p) => s + p.dice.filter(d => d === game.bid.face || d === 1).length, 0);
    const isLiar = total < game.bid.count;
    const loser = isLiar ? game.bid.pIdx : game.turn;
    
    game.logs.push(`--- LIAR! Có ${total} con ${game.bid.face} (tính cả 1) ---`);
    game.logs.push(`${players[loser].name} mất 1 xúc xắc!`);
    
    players[loser].dice.pop();
    if (players[loser].dice.length === 0) players[loser].alive = false;
    
    game.turn = loser;
    while (players.filter(p => p.alive).length > 1 && !players[game.turn].alive) {
        game.turn = (game.turn + 1) % players.length;
    }
    
    if (players.filter(p => p.alive).length <= 1) {
        game.logs.push(`TRÒ CHƠI KẾT THÚC!`);
        game.active = false;
        sync(true);
    } else {
        newRound();
    }
  });

  socket.on('disconnect', () => {
    players = players.filter(p => p.id !== socket.id);
    if (players.length < 2) game.active = false;
    sync();
  });

  function newRound() {
    players.forEach(p => { 
      if (p.alive) p.dice = Array.from({length: p.dice.length || 5}, () => Math.floor(Math.random()*6)+1); 
    });
    game.bid = { count: 0, face: 0, pIdx: -1 };
    sync(true);
  }

  function nextTurn() {
    do { game.turn = (game.turn + 1) % players.length; } while (!players[game.turn].alive);
  }

  function isValid(b) {
    if (b.face < 1 || b.face > 6) return false;
    if (game.bid.count === 0) return true;
    return b.count > game.bid.count || (b.count === game.bid.count && b.face > game.bid.face);
  }

  function sync(showAll = false) {
    players.forEach(p => {
      const masked = players.map(pl => ({
        name: pl.name, alive: pl.alive, count: pl.dice.length,
        dice: (showAll || pl.id === p.id) ? pl.dice : []
      }));
      io.to(p.id).emit('update', { players: masked, game, me: p.id });
    });
  }
});

// QUAN TRỌNG: Lắng nghe trên 0.0.0.0
const PORT = process.env.PORT || 3000;
http.listen(PORT, '0.0.0.0', () => {
  console.log('Server is running on port ' + PORT);
});