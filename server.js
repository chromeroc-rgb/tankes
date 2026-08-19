const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 20;
const WORLD_WIDTH = 2000;
const WORLD_HEIGHT = 2000;

app.use(express.static(path.join(__dirname, 'public')));

// Estado del juego
const players = {};
let bullets = [];
let bulletIdCounter = 0;

const COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#e67e22', '#1abc9c', '#e84393'];

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min)) + min;
}

function spawnPlayer(name) {
  return {
    name: name.substring(0, 15) || 'Tanque',
    x: getRandomInt(100, WORLD_WIDTH - 100),
    y: getRandomInt(100, WORLD_HEIGHT - 100),
    angle: 0,
    turretAngle: 0,
    color: COLORS[getRandomInt(0, COLORS.length)],
    hp: 100,
    maxHp: 100,
    kills: 0,
    deaths: 0,
    alive: true,
    lastShot: 0
  };
}

io.on('connection', (socket) => {
  // Límite de jugadores
  if (Object.keys(players).length >= MAX_PLAYERS) {
    socket.emit('server_full', { message: 'El servidor ha alcanzado el límite de 20 jugadores.' });
    socket.disconnect();
    return;
  }

  socket.on('join_game', (playerName) => {
    players[socket.id] = spawnPlayer(playerName);
    socket.emit('init_world', {
      id: socket.id,
      world: { width: WORLD_WIDTH, height: WORLD_HEIGHT }
    });
  });

  socket.on('player_input', (input) => {
    const player = players[socket.id];
    if (!player || !player.alive) return;

    const speed = 4;
    const rotSpeed = 0.05;

    if (input.left) player.angle -= rotSpeed;
    if (input.right) player.angle += rotSpeed;

    if (input.up) {
      player.x += Math.cos(player.angle) * speed;
      player.y += Math.sin(player.angle) * speed;
    }
    if (input.down) {
      player.x -= Math.cos(player.angle) * (speed * 0.6);
      player.y -= Math.sin(player.angle) * (speed * 0.6);
    }

    // Límites de mapa
    player.x = Math.max(30, Math.min(WORLD_WIDTH - 30, player.x));
    player.y = Math.max(30, Math.min(WORLD_HEIGHT - 30, player.y));
    player.turretAngle = input.turretAngle;

    // Disparo
    if (input.shoot && Date.now() - player.lastShot > 400) {
      player.lastShot = Date.now();
      bullets.push({
        id: bulletIdCounter++,
        ownerId: socket.id,
        x: player.x + Math.cos(player.turretAngle) * 35,
        y: player.y + Math.sin(player.turretAngle) * 35,
        dx: Math.cos(player.turretAngle) * 12,
        dy: Math.sin(player.turretAngle) * 12,
        life: 80
      });
    }
  });

  socket.on('respawn', () => {
    if (players[socket.id]) {
      const currentKills = players[socket.id].kills;
      const currentDeaths = players[socket.id].deaths;
      const name = players[socket.id].name;
      players[socket.id] = spawnPlayer(name);
      players[socket.id].kills = currentKills;
      players[socket.id].deaths = currentDeaths;
    }
  });

  socket.on('disconnect', () => {
    delete players[socket.id];
  });
});

// Ciclo de física del servidor (45 ticks/segundo)
setInterval(() => {
  // Actualizar proyectiles
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.dx;
    b.y += b.dy;
    b.life--;

    let hit = false;

    // Colisión contra límites
    if (b.x < 0 || b.x > WORLD_WIDTH || b.y < 0 || b.y > WORLD_HEIGHT || b.life <= 0) {
      hit = true;
    }

    // Colisión contra tanques
    if (!hit) {
      for (const [id, player] of Object.entries(players)) {
        if (id !== b.ownerId && player.alive) {
          const dist = Math.hypot(player.x - b.x, player.y - b.y);
          if (dist < 26) {
            hit = true;
            player.hp -= 25;

            if (player.hp <= 0) {
              player.alive = false;
              player.deaths++;
              if (players[b.ownerId]) {
                players[b.ownerId].kills++;
              }
              io.emit('player_killed', {
                killer: players[b.ownerId] ? players[b.ownerId].name : 'Desconocido',
                victim: player.name
              });
            }
            break;
          }
        }
      }
    }

    if (hit) {
      bullets.splice(i, 1);
    }
  }

  // Generar ranking ordenado por bajas (kills)
  const leaderboard = Object.values(players)
    .map(p => ({ name: p.name, kills: p.kills, deaths: p.deaths }))
    .sort((a, b) => b.kills - a.kills)
    .slice(0, 10);

  // Emitir estado global a todos los clientes
  io.emit('game_state', {
    players,
    bullets,
    leaderboard
  });
}, 1000 / 45);

server.listen(PORT, () => {
  console.log(`Servidor activo en el puerto ${PORT}`);
});
