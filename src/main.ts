import "./style.css";

type Point = { x: number; y: number };
type Body = Point & { radius: number; vx: number; vy: number };
type Enemy = Body & { hp: number; phase: number; value: number };
type Particle = Body & { life: number; color: string };

function required<T>(value: T | null, label: string): T {
  if (!value) throw new Error(`${label} est indisponible.`);
  return value;
}

const canvas = required(document.querySelector<HTMLCanvasElement>("#game"), "Le canvas");
const scoreEl = required(document.querySelector<HTMLElement>("#score"), "Le score");
const waveEl = required(document.querySelector<HTMLElement>("#wave"), "La vague");
const livesEl = required(document.querySelector<HTMLElement>("#lives"), "Les vies");
const message = required(document.querySelector<HTMLElement>("#message"), "Le message");
const startButton = required(document.querySelector<HTMLButtonElement>("#start"), "Le bouton");
const ctx = required(canvas.getContext("2d"), "Le contexte Canvas 2D");

const WIDTH = 720;
const HEIGHT = 960;
const keys = new Set<string>();
const player: Body = { x: WIDTH / 2, y: HEIGHT - 110, radius: 20, vx: 0, vy: 0 };
let bullets: Body[] = [];
let enemies: Enemy[] = [];
let particles: Particle[] = [];
let running = false;
let lastTime = 0;
let spawnTimer = 0;
let shotTimer = 0;
let elapsed = 0;
let score = 0;
let wave = 1;
let lives = 3;
let invulnerable = 0;
let pointerActive = false;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const collides = (a: Body, b: Body) => Math.hypot(a.x - b.x, a.y - b.y) < a.radius + b.radius;

function reset() {
  player.x = WIDTH / 2;
  player.y = HEIGHT - 110;
  bullets = [];
  enemies = [];
  particles = [];
  spawnTimer = 0.4;
  shotTimer = 0;
  elapsed = 0;
  score = 0;
  wave = 1;
  lives = 3;
  invulnerable = 0;
  updateHud();
}

function updateHud() {
  scoreEl.textContent = score.toString().padStart(4, "0");
  waveEl.textContent = wave.toString().padStart(2, "0");
  livesEl.textContent = lives > 0 ? Array.from({ length: lives }, () => "●").join(" ") : "—";
}

function startGame() {
  reset();
  running = true;
  lastTime = performance.now();
  message.classList.add("hidden");
  requestAnimationFrame(loop);
}

function endGame() {
  running = false;
  message.querySelector(".message-kicker")!.textContent = `Score final · ${score}`;
  message.querySelector("h2")!.textContent = "Mission interrompue";
  message.querySelector("p:not(.message-kicker)")!.textContent =
    `Tu as atteint la vague ${wave}. Le prototype ne déclenche aucune action Discord.`;
  startButton.textContent = "Recommencer";
  message.classList.remove("hidden");
}

function spawnEnemy() {
  const radius = 16 + Math.random() * 10;
  const hp = 1 + Math.floor((wave - 1) / 3);
  enemies.push({
    x: 50 + Math.random() * (WIDTH - 100),
    y: -radius,
    radius,
    vx: 0,
    vy: 90 + wave * 8 + Math.random() * 35,
    hp,
    phase: Math.random() * Math.PI * 2,
    value: 50 * hp,
  });
}

function fire() {
  const level = score >= 2500 ? 3 : score >= 900 ? 2 : 1;
  const offsets = level === 1 ? [0] : level === 2 ? [-12, 12] : [-18, 0, 18];
  for (const offset of offsets) {
    bullets.push({
      x: player.x + offset,
      y: player.y - player.radius,
      radius: 5,
      vx: offset * 1.6,
      vy: -620,
    });
  }
}

function burst(x: number, y: number, color: string, count = 10) {
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 40 + Math.random() * 170;
    particles.push({
      x,
      y,
      radius: 2 + Math.random() * 4,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.35 + Math.random() * 0.45,
      color,
    });
  }
}

function update(dt: number) {
  elapsed += dt;
  wave = 1 + Math.floor(elapsed / 18);
  invulnerable = Math.max(0, invulnerable - dt);

  const horizontal = Number(keys.has("arrowright") || keys.has("d")) - Number(keys.has("arrowleft") || keys.has("q") || keys.has("a"));
  const vertical = Number(keys.has("arrowdown") || keys.has("s")) - Number(keys.has("arrowup") || keys.has("z") || keys.has("w"));
  const length = Math.hypot(horizontal, vertical) || 1;
  player.x = clamp(player.x + (horizontal / length) * 360 * dt, 28, WIDTH - 28);
  player.y = clamp(player.y + (vertical / length) * 360 * dt, 38, HEIGHT - 38);

  shotTimer -= dt;
  if (shotTimer <= 0) {
    fire();
    shotTimer = score >= 2500 ? 0.18 : 0.24;
  }

  spawnTimer -= dt;
  if (spawnTimer <= 0) {
    spawnEnemy();
    spawnTimer = Math.max(0.22, 0.72 - wave * 0.035) * (0.75 + Math.random() * 0.5);
  }

  for (const bullet of bullets) {
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
  }
  bullets = bullets.filter((bullet) => bullet.y > -20 && bullet.x > -20 && bullet.x < WIDTH + 20);

  for (const enemy of enemies) {
    enemy.phase += dt * 2.2;
    enemy.x += Math.sin(enemy.phase) * (35 + wave * 2) * dt;
    enemy.y += enemy.vy * dt;
  }

  for (const enemy of enemies) {
    for (const bullet of bullets) {
      if (bullet.radius > 0 && enemy.hp > 0 && collides(enemy, bullet)) {
        bullet.radius = 0;
        enemy.hp -= 1;
        if (enemy.hp === 0) {
          score += enemy.value;
          burst(enemy.x, enemy.y, "#ff6b5e", 12);
        }
      }
    }
  }
  bullets = bullets.filter((bullet) => bullet.radius > 0);
  enemies = enemies.filter((enemy) => enemy.hp > 0);

  for (const enemy of enemies) {
    if (enemy.y > HEIGHT + enemy.radius) {
      enemy.hp = 0;
      damagePlayer();
    } else if (invulnerable <= 0 && collides(enemy, player)) {
      enemy.hp = 0;
      burst(enemy.x, enemy.y, "#f5f0df", 16);
      damagePlayer();
    }
  }
  enemies = enemies.filter((enemy) => enemy.hp > 0);

  for (const particle of particles) {
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vx *= 0.97;
    particle.vy *= 0.97;
    particle.life -= dt;
  }
  particles = particles.filter((particle) => particle.life > 0);
  updateHud();
}

function damagePlayer() {
  if (invulnerable > 0) return;
  lives -= 1;
  invulnerable = 1.4;
  burst(player.x, player.y, "#50e3d2", 20);
  if (lives <= 0) endGame();
}

function roundedRect(x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}

function draw() {
  const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  gradient.addColorStop(0, "#0b2e32");
  gradient.addColorStop(1, "#06191e");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.strokeStyle = "rgba(80, 227, 210, 0.08)";
  ctx.lineWidth = 1;
  const offset = (elapsed * 55) % 80;
  for (let y = -80 + offset; y < HEIGHT; y += 80) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(WIDTH, y);
    ctx.stroke();
  }
  for (let x = 80; x < WIDTH; x += 80) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, HEIGHT);
    ctx.stroke();
  }

  for (const bullet of bullets) {
    ctx.fillStyle = "#50e3d2";
    ctx.shadowColor = "#50e3d2";
    ctx.shadowBlur = 16;
    roundedRect(bullet.x - 4, bullet.y - 13, 8, 26, 4);
    ctx.fill();
  }
  ctx.shadowBlur = 0;

  for (const enemy of enemies) {
    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    ctx.rotate(enemy.phase * 0.35);
    ctx.fillStyle = "#ff6b5e";
    ctx.strokeStyle = "#f5f0df";
    ctx.lineWidth = 3;
    roundedRect(-enemy.radius, -enemy.radius, enemy.radius * 2, enemy.radius * 2, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#071b20";
    ctx.fillRect(-enemy.radius * 0.45, -3, enemy.radius * 0.9, 6);
    ctx.restore();
  }

  for (const particle of particles) {
    ctx.globalAlpha = clamp(particle.life * 2, 0, 1);
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  if (invulnerable <= 0 || Math.floor(invulnerable * 12) % 2 === 0) {
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.fillStyle = "#f5f0df";
    ctx.strokeStyle = "#50e3d2";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(0, -29);
    ctx.lineTo(23, 21);
    ctx.lineTo(0, 12);
    ctx.lineTo(-23, 21);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ff6b5e";
    ctx.beginPath();
    ctx.arc(0, 4, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function loop(time: number) {
  if (!running) return;
  const dt = Math.min((time - lastTime) / 1000, 0.033);
  lastTime = time;
  update(dt);
  draw();
  if (running) requestAnimationFrame(loop);
}

function movePointer(event: PointerEvent) {
  if (!pointerActive || !running) return;
  const rect = canvas.getBoundingClientRect();
  player.x = clamp(((event.clientX - rect.left) / rect.width) * WIDTH, 28, WIDTH - 28);
  player.y = clamp(((event.clientY - rect.top) / rect.height) * HEIGHT, 38, HEIGHT - 38);
}

window.addEventListener("keydown", (event) => {
  keys.add(event.key.toLowerCase());
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(event.key)) {
    event.preventDefault();
  }
});
window.addEventListener("keyup", (event) => keys.delete(event.key.toLowerCase()));
canvas.addEventListener("pointerdown", (event) => {
  pointerActive = true;
  canvas.setPointerCapture(event.pointerId);
  movePointer(event);
});
canvas.addEventListener("pointermove", movePointer);
canvas.addEventListener("pointerup", () => { pointerActive = false; });
canvas.addEventListener("pointercancel", () => { pointerActive = false; });
startButton.addEventListener("click", startGame);

draw();
