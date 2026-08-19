const socket = io();
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

let myId = null;
let world = { width: 2000, height: 2000 };
let gameState = { players: {}, bullets: [], leaderboard: [] };

const loginModal = document.getElementById('login-modal');
const deathModal = document.getElementById('death-modal');
const btnJoin = document.getElementById('btn-join');
const btnRespawn = document.getElementById('btn-respawn');
const playerNameInput = document.getElementById('player-name');
const leaderboardList = document.getElementById('leaderboard-list');
const killFeed = document.getElementById('kill-feed');

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

const input = {
  up: false,
  down: false,
  left: false,
  right: false,
  shoot: false,
  turretAngle: 0
};

let mouseX = 0;
let mouseY = 0;

// Eventos de teclado
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyW' || e.code === 'ArrowUp') input.up = true;
  if (e.code === 'KeyS' || e.code === 'ArrowDown') input.down = true;
  if (e.code === 'KeyA' || e.code === 'ArrowLeft') input.left = true;
  if (e.code === 'KeyD' || e.code === 'ArrowRight') input.right = true;
});

window.addEventListener('keyup', (e) => {
  if (e.code === 'KeyW' || e.code === 'ArrowUp') input.up = false;
  if (e.code === 'KeyS' || e.code === 'ArrowDown') input.down = false;
  if (e.code === 'KeyA' || e.code === 'ArrowLeft') input.left = false;
  if (e.code === 'KeyD' || e.code === 'ArrowRight') input.right = false;
});

window.addEventListener('mousemove', (e) => {
  mouseX = e.clientX;
  mouseY = e.clientY;
});

window.addEventListener('mousedown', (e) => {
  if (e.button === 0) input.shoot = true;
});

window.addEventListener('mouseup', (e) => {
  if (e.button === 0) input.shoot = false;
});

// Conexión y Login
btnJoin.addEventListener('click', () => {
  const name = playerNameInput.value.trim() || 'Tanque';
  socket.emit('join_game', name);
  loginModal.classList.add('hidden');
});

playerNameInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') btnJoin.click();
});

btnRespawn.addEventListener('click', () => {
  socket.emit('respawn');
  deathModal.classList.add('hidden');
});

socket.on('init_world', (data) => {
  myId = data.id;
  world = data.world;
});

socket.on('game_state', (state) => {
  gameState = state;

  // Actualizar tabla de posiciones
  leaderboardList.innerHTML = '';
  state.leaderboard.forEach(entry => {
    const li = document.createElement('li');
    li.textContent = `${entry.name}: ${entry.kills} bajas`;
    leaderboardList.appendChild(li);
  });

  // Comprobar estado del jugador actual
  const me = state.players[myId];
  if (me && !me.alive && deathModal.classList.contains('hidden') && loginModal.classList.contains('hidden')) {
    deathModal.classList.remove('hidden');
  }
});

socket.on('player_killed', (data) => {
  const msg = document.createElement('div');
  msg.className = 'kill-msg';
  msg.textContent = `${data.killer} eliminó a ${data.victim}`;
  killFeed.appendChild(msg);
  setTimeout(() => msg.remove(), 4000);
});

// Enviar entradas al servidor (60 FPS)
setInterval(() => {
  const me = gameState.players[myId];
  if (me && me.alive) {
    const screenCenterX = canvas.width / 2;
    const screenCenterY = canvas.height / 2;
    input.turretAngle = Math.atan2(mouseY - screenCenterY, mouseX - screenCenterX);
    socket.emit('player_input', input);
  }
}, 1000 / 60);

// Bucle de renderizado
function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const me = gameState.players[myId] || { x: world.width / 2, y: world.height / 2 };

  // Cámara centrada en el jugador local
  const camX = canvas.width / 2 - me.x;
  const camY = canvas.height / 2 - me.y;

  ctx.save();
  ctx.translate(camX, camY);

  // Cuadrícula de fondo
  ctx.strokeStyle = '#2c3e50';
  ctx.lineWidth = 1;
  const gridSize = 60;
  for (let x = 0; x <= world.width; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, world.height);
    ctx.stroke();
  }
  for (let y = 0; y <= world.height; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(world.width, y);
    ctx.stroke();
  }

  // Borde del mapa
  ctx.strokeStyle = '#e74c3c';
  ctx.lineWidth = 4;
  ctx.strokeRect(0, 0, world.width, world.height);

  // Dibujar proyectiles
  ctx.fillStyle = '#f1c40f';
  gameState.bullets.forEach(b => {
    ctx.beginPath();
    ctx.arc(b.x, b.y, 4, 0, Math.PI * 2);
    ctx.fill();
  });

  // Dibujar tanques
  Object.entries(gameState.players).forEach(([id, player]) => {
    if (!player.alive) return;

    ctx.save();
    ctx.translate(player.x, player.y);

    // Chasis del tanque
    ctx.rotate(player.angle);
    ctx.fillStyle = player.color;
    ctx.fillRect(-20, -16, 40, 32);

    // Orugas
    ctx.fillStyle = '#1e272e';
    ctx.fillRect(-22, -18, 44, 6);
    ctx.fillRect(-22, 12, 44, 6);

    ctx.restore();

    // Torreta y cañón
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(player.turretAngle);

    ctx.fillStyle = '#2f3542';
    ctx.fillRect(0, -4, 26, 8); // Cañón
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2); // Domo
    ctx.fillStyle = '#57606f';
    ctx.fill();
    ctx.restore();

    // Barra de salud y nombre
    ctx.fillStyle = '#ffffff';
    ctx.font = '12px Segoe UI';
    ctx.textAlign = 'center';
    ctx.fillText(player.name, player.x, player.y - 30);

    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(player.x - 20, player.y - 25, 40, 5);
    ctx.fillStyle = player.hp > 30 ? '#2ecc71' : '#e74c3c';
    ctx.fillRect(player.x - 20, player.y - 25, (player.hp / player.maxHp) * 40, 5);
  });

  ctx.restore();
  requestAnimationFrame(render);
}

requestAnimationFrame(render);