import "./style.css";

type Point = { x: number; y: number };
type Body = Point & { radius: number; vx: number; vy: number };
type WeedKind = "bramble" | "thistle" | "nettle";
type Weed = Body & {
  hp: number;
  maxHp: number;
  phase: number;
  kind: WeedKind;
  guarding: boolean;
  fireTimer: number;
};
type Projectile = Body & { hostile: boolean; damage: number };
type Particle = Body & { life: number; maxLife: number; color: string };
type FloatingText = Point & { text: string; color: string; life: number; vy: number };

function required<T>(value: T | null, label: string): T {
  if (!value) throw new Error(`${label} est indisponible.`);
  return value;
}

const canvas = required(document.querySelector<HTMLCanvasElement>("#game"), "Le canvas");
const scoreEl = required(document.querySelector<HTMLElement>("#score"), "Le score");
const waveEl = required(document.querySelector<HTMLElement>("#wave"), "La vague");
const livesEl = required(document.querySelector<HTMLElement>("#lives"), "Les vies");
const message = required(document.querySelector<HTMLElement>("#message"), "Le message");
const messageCopy = required(document.querySelector<HTMLElement>("#message-copy"), "Le texte");
const startButton = required(document.querySelector<HTMLButtonElement>("#start"), "Le bouton");
const bossHud = required(document.querySelector<HTMLElement>("#boss-hud"), "L’interface du boss");
const bossHealth = required(document.querySelector<HTMLElement>("#boss-health"), "La vie du boss");
const targetNameEl = required(document.querySelector<HTMLElement>("#target-name"), "Le nom de cible");
const shieldState = required(document.querySelector<HTMLElement>("#shield-state"), "Le bouclier");
const ctx = required(canvas.getContext("2d"), "Le contexte Canvas 2D");

const WIDTH = 960;
const HEIGHT = 720;
const params = new URLSearchParams(window.location.search);
const rawTargetName = params.get("target")?.trim();
const targetName = rawTargetName?.slice(0, 28) || "Membre du staff";
const avatarUrl = params.get("avatar");
const background = new Image();
const avatar = new Image();

background.src = `${import.meta.env.BASE_URL}assets/arena-hd2d.png`;
avatar.crossOrigin = "anonymous";
let avatarReady = false;
if (avatarUrl && /^https:\/\//i.test(avatarUrl)) {
  avatar.addEventListener("load", () => { avatarReady = true; });
  avatar.src = avatarUrl;
}
targetNameEl.textContent = targetName;

const keys = new Set<string>();
const player: Body = { x: WIDTH / 2, y: HEIGHT - 90, radius: 19, vx: 0, vy: 0 };
const boss: Body & { hp: number; maxHp: number; phase: number } = {
  x: WIDTH / 2,
  y: 154,
  radius: 58,
  vx: 0,
  vy: 0,
  hp: 100,
  maxHp: 100,
  phase: 0,
};

let projectiles: Projectile[] = [];
let weeds: Weed[] = [];
let particles: Particle[] = [];
let floatingTexts: FloatingText[] = [];
let running = false;
let lastTime = 0;
let elapsed = 0;
let shotTimer = 0;
let wandererTimer = 0;
let score = 0;
let wave = 1;
let lives = 3;
let invulnerable = 0;
let pointerActive = false;
let protectionStage = 0;
let shieldMessageCooldown = 0;
let screenShake = 0;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const collides = (a: Body, b: Body) => Math.hypot(a.x - b.x, a.y - b.y) < a.radius + b.radius;
const guardingWeeds = () => weeds.filter((weed) => weed.guarding && weed.hp > 0).length;

function reset() {
  player.x = WIDTH / 2;
  player.y = HEIGHT - 90;
  boss.x = WIDTH / 2;
  boss.y = 154;
  boss.hp = boss.maxHp;
  boss.phase = 0;
  projectiles = [];
  weeds = [];
  particles = [];
  floatingTexts = [];
  elapsed = 0;
  shotTimer = 0;
  wandererTimer = 2.5;
  score = 0;
  wave = 1;
  lives = 3;
  invulnerable = 0;
  protectionStage = 0;
  shieldMessageCooldown = 0;
  screenShake = 0;
  spawnProtectionWave(6);
  updateHud();
}

function updateHud() {
  scoreEl.textContent = score.toString().padStart(4, "0");
  waveEl.textContent = wave.toString().padStart(2, "0");
  livesEl.textContent = lives > 0 ? Array.from({ length: lives }, () => "◆").join(" ") : "—";
  bossHealth.style.width = `${Math.max(0, boss.hp)}%`;
  const guards = guardingWeeds();
  shieldState.textContent = guards > 0
    ? `${guards} mauvaise${guards > 1 ? "s" : ""} herbe${guards > 1 ? "s" : ""} · protection active`
    : "Protection brisée · cible vulnérable";
  shieldState.style.color = guards > 0 ? "#a5ce8a" : "#ffcb72";
}

function startGame() {
  reset();
  running = true;
  lastTime = performance.now();
  message.classList.add("hidden");
  bossHud.classList.remove("hidden");
  requestAnimationFrame(loop);
}

function finishGame(victory: boolean) {
  running = false;
  bossHud.classList.add("hidden");
  const kicker = required(message.querySelector<HTMLElement>(".title-flourish"), "Le surtitre");
  const heading = required(message.querySelector<HTMLElement>("h1"), "Le titre");
  const subtitle = required(message.querySelector<HTMLElement>(".title-subtitle"), "Le sous-titre");

  if (victory) {
    kicker.textContent = "✦  VERDICT DU JARDIN  ✦";
    heading.textContent = "URATISÉ";
    heading.dataset.text = "URATISÉ";
    subtitle.textContent = `${targetName} ne résiste plus`;
    messageCopy.textContent =
      `La cible a perdu toute sa vitalité après ${wave} vague${wave > 1 ? "s" : ""}. Résultat de démonstration : aucune sanction Discord n’a été exécutée.`;
    startButton.querySelector("span")!.textContent = "Rejouer le verdict";
  } else {
    kicker.textContent = "✦  LA FRICHE A TRIOMPHÉ  ✦";
    heading.textContent = "ÉCHEC";
    heading.dataset.text = "ÉCHEC";
    subtitle.textContent = "L’inactivité gagne du terrain";
    messageCopy.textContent =
      `Les mauvaises herbes ont protégé ${targetName}. Tu as récolté ${score} points avant de tomber.`;
    startButton.querySelector("span")!.textContent = "Reprendre la chasse";
  }
  message.classList.remove("hidden");
}

function spawnProtectionWave(count: number) {
  wave += protectionStage > 0 ? 1 : 0;
  for (let i = 0; i < count; i += 1) {
    const angle = (Math.PI * 2 * i) / count + Math.PI / 2;
    const distance = 118 + (i % 2) * 34;
    const hp = 3 + wave;
    weeds.push({
      x: boss.x + Math.cos(angle) * distance,
      y: boss.y + Math.sin(angle) * distance * 0.55 + 38,
      radius: 23,
      vx: 0,
      vy: 0,
      hp,
      maxHp: hp,
      phase: angle,
      kind: i % 3 === 0 ? "thistle" : i % 2 === 0 ? "nettle" : "bramble",
      guarding: true,
      fireTimer: 1.2 + Math.random() * 2,
    });
  }
  burst(boss.x, boss.y, "#72df92", 28);
  floatingTexts.push({ x: boss.x, y: boss.y + 82, text: "RACINES PROTECTRICES", color: "#b5e399", life: 1.4, vy: -22 });
  updateHud();
}

function spawnWanderer() {
  const fromLeft = Math.random() > 0.5;
  const hp = 2 + Math.floor(wave / 2);
  weeds.push({
    x: fromLeft ? -30 : WIDTH + 30,
    y: 270 + Math.random() * 270,
    radius: 20,
    vx: fromLeft ? 55 + wave * 4 : -(55 + wave * 4),
    vy: 18 + Math.random() * 28,
    hp,
    maxHp: hp,
    phase: Math.random() * Math.PI * 2,
    kind: Math.random() > 0.5 ? "nettle" : "bramble",
    guarding: false,
    fireTimer: 2 + Math.random() * 2,
  });
}

function firePlayer() {
  const offsets = score >= 2400 ? [-14, 0, 14] : score >= 900 ? [-10, 10] : [0];
  for (const offset of offsets) {
    projectiles.push({
      x: player.x + offset,
      y: player.y - 22,
      radius: 5,
      vx: offset * 1.25,
      vy: -610,
      hostile: false,
      damage: 2,
    });
  }
}

function fireSpore(weed: Weed) {
  const angle = Math.atan2(player.y - weed.y, player.x - weed.x);
  projectiles.push({
    x: weed.x,
    y: weed.y + 8,
    radius: 7,
    vx: Math.cos(angle) * 145,
    vy: Math.sin(angle) * 145,
    hostile: true,
    damage: 1,
  });
}

function burst(x: number, y: number, color: string, count = 12) {
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 45 + Math.random() * 190;
    const life = 0.35 + Math.random() * 0.65;
    particles.push({
      x,
      y,
      radius: 2 + Math.random() * 4,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life,
      maxLife: life,
      color,
    });
  }
}

function damagePlayer() {
  if (invulnerable > 0) return;
  lives -= 1;
  invulnerable = 1.5;
  screenShake = 12;
  burst(player.x, player.y, "#f3b55f", 24);
  floatingTexts.push({ x: player.x, y: player.y - 30, text: "OUCH !", color: "#ff8565", life: 0.9, vy: -34 });
  if (lives <= 0) finishGame(false);
}

function update(dt: number) {
  elapsed += dt;
  invulnerable = Math.max(0, invulnerable - dt);
  shieldMessageCooldown = Math.max(0, shieldMessageCooldown - dt);
  screenShake = Math.max(0, screenShake - dt * 32);
  boss.phase += dt;
  boss.x = WIDTH / 2 + Math.sin(boss.phase * 0.65) * 112;

  const horizontal =
    Number(keys.has("arrowright") || keys.has("d")) -
    Number(keys.has("arrowleft") || keys.has("q") || keys.has("a"));
  const vertical =
    Number(keys.has("arrowdown") || keys.has("s")) -
    Number(keys.has("arrowup") || keys.has("z") || keys.has("w"));
  const length = Math.hypot(horizontal, vertical) || 1;
  player.x = clamp(player.x + (horizontal / length) * 340 * dt, 36, WIDTH - 36);
  player.y = clamp(player.y + (vertical / length) * 340 * dt, 315, HEIGHT - 38);

  shotTimer -= dt;
  if (shotTimer <= 0) {
    firePlayer();
    shotTimer = score >= 2400 ? 0.19 : 0.25;
  }

  wandererTimer -= dt;
  if (wandererTimer <= 0) {
    spawnWanderer();
    wandererTimer = Math.max(1.35, 3.4 - wave * 0.22);
  }

  for (const projectile of projectiles) {
    projectile.x += projectile.vx * dt;
    projectile.y += projectile.vy * dt;
  }

  for (const weed of weeds) {
    weed.phase += dt * (weed.guarding ? 1.5 : 3);
    if (weed.guarding) {
      weed.x += Math.sin(weed.phase) * 8 * dt;
      weed.y += Math.cos(weed.phase * 0.8) * 5 * dt;
    } else {
      weed.x += weed.vx * dt;
      weed.y += weed.vy * dt;
      weed.vx += (player.x - weed.x) * 0.012 * dt;
    }
    weed.fireTimer -= dt;
    if (weed.fireTimer <= 0 && weed.y < player.y - 80) {
      fireSpore(weed);
      weed.fireTimer = 2.3 + Math.random() * 2.2;
    }
  }

  for (const projectile of projectiles) {
    if (projectile.radius <= 0) continue;
    if (projectile.hostile) {
      if (invulnerable <= 0 && collides(projectile, player)) {
        projectile.radius = 0;
        damagePlayer();
      }
      continue;
    }

    let hitWeed = false;
    for (const weed of weeds) {
      if (weed.hp > 0 && collides(projectile, weed)) {
        projectile.radius = 0;
        weed.hp -= projectile.damage;
        hitWeed = true;
        burst(projectile.x, projectile.y, "#b6df79", 5);
        floatingTexts.push({ x: weed.x, y: weed.y - 20, text: `-${projectile.damage}`, color: "#f9e59e", life: 0.55, vy: -28 });
        if (weed.hp <= 0) {
          score += weed.guarding ? 180 : 90;
          screenShake = 4;
          burst(weed.x, weed.y, weed.kind === "thistle" ? "#a26fde" : "#67b959", 18);
        }
        break;
      }
    }
    if (hitWeed || projectile.radius <= 0) continue;

    if (collides(projectile, boss)) {
      projectile.radius = 0;
      if (guardingWeeds() > 0) {
        burst(projectile.x, projectile.y, "#71e6c9", 7);
        if (shieldMessageCooldown <= 0) {
          floatingTexts.push({ x: boss.x, y: boss.y + 82, text: "PROTÉGÉ !", color: "#7ff0d1", life: 0.75, vy: -20 });
          shieldMessageCooldown = 0.7;
        }
      } else {
        boss.hp -= projectile.damage;
        score += 25;
        screenShake = 3;
        burst(projectile.x, projectile.y, "#ffb34f", 8);
        floatingTexts.push({ x: boss.x + (Math.random() - 0.5) * 55, y: boss.y - 45, text: `-${projectile.damage}`, color: "#ffdc7e", life: 0.65, vy: -32 });
        if (boss.hp <= 0) {
          boss.hp = 0;
          burst(boss.x, boss.y, "#ffe094", 70);
          updateHud();
          finishGame(true);
          return;
        }
      }
    }
  }

  for (const weed of weeds) {
    if (!weed.guarding && weed.hp > 0 && collides(weed, player)) {
      weed.hp = 0;
      burst(weed.x, weed.y, "#789b51", 12);
      damagePlayer();
    }
  }

  projectiles = projectiles.filter((projectile) =>
    projectile.radius > 0 &&
    projectile.y > -30 &&
    projectile.y < HEIGHT + 30 &&
    projectile.x > -40 &&
    projectile.x < WIDTH + 40
  );
  weeds = weeds.filter((weed) => weed.hp > 0 && weed.y < HEIGHT + 60 && weed.x > -80 && weed.x < WIDTH + 80);

  if (guardingWeeds() === 0) {
    if (protectionStage === 0 && boss.hp <= 68) {
      protectionStage = 1;
      spawnProtectionWave(7);
    } else if (protectionStage === 1 && boss.hp <= 34) {
      protectionStage = 2;
      spawnProtectionWave(8);
    }
  }

  for (const particle of particles) {
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vx *= 0.965;
    particle.vy = particle.vy * 0.965 + 18 * dt;
    particle.life -= dt;
  }
  particles = particles.filter((particle) => particle.life > 0);

  for (const text of floatingTexts) {
    text.y += text.vy * dt;
    text.life -= dt;
  }
  floatingTexts = floatingTexts.filter((text) => text.life > 0);
  updateHud();
}

function drawBackground() {
  if (background.complete && background.naturalWidth > 0) {
    const scale = Math.max(WIDTH / background.naturalWidth, HEIGHT / background.naturalHeight);
    const width = background.naturalWidth * scale;
    const height = background.naturalHeight * scale;
    ctx.drawImage(background, (WIDTH - width) / 2, (HEIGHT - height) / 2, width, height);
  } else {
    const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    gradient.addColorStop(0, "#294b32");
    gradient.addColorStop(1, "#6f542d");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }
  ctx.fillStyle = "rgba(17, 11, 5, 0.16)";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  for (let i = 0; i < 22; i += 1) {
    const x = (i * 137 + elapsed * (8 + (i % 3) * 4)) % (WIDTH + 80) - 40;
    const y = (i * 83) % HEIGHT;
    ctx.globalAlpha = 0.18 + (i % 4) * 0.05;
    ctx.fillStyle = i % 3 === 0 ? "#fff1a8" : "#d6a74b";
    ctx.fillRect(Math.round(x), y, i % 2 ? 2 : 3, i % 2 ? 2 : 3);
  }
  ctx.globalAlpha = 1;
}

function drawWeed(weed: Weed) {
  const bob = Math.sin(weed.phase * 2) * 3;
  ctx.save();
  ctx.translate(Math.round(weed.x), Math.round(weed.y + bob));

  ctx.globalAlpha = 0.34;
  ctx.fillStyle = "#130d08";
  ctx.beginPath();
  ctx.ellipse(0, 20, weed.radius * 1.25, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  if (weed.guarding) {
    ctx.strokeStyle = "rgba(113, 230, 201, 0.55)";
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.arc(0, 0, weed.radius + 8 + Math.sin(elapsed * 4) * 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  const main = weed.kind === "thistle" ? "#68418f" : weed.kind === "nettle" ? "#367f45" : "#345c2e";
  const light = weed.kind === "thistle" ? "#bd7ad9" : "#78b957";
  ctx.strokeStyle = "#172117";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(0, 20);
  ctx.quadraticCurveTo(-4, 2, 1, -20);
  ctx.stroke();
  ctx.strokeStyle = main;
  ctx.lineWidth = 3;
  ctx.stroke();

  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i += 1) {
      const y = 10 - i * 11;
      ctx.fillStyle = main;
      ctx.beginPath();
      ctx.moveTo(side * 1, y);
      ctx.quadraticCurveTo(side * (12 + i * 3), y - 10, side * (19 + i * 2), y - 4);
      ctx.quadraticCurveTo(side * 12, y + 4, side * 1, y + 5);
      ctx.fill();
      ctx.fillStyle = light;
      ctx.fillRect(side * (8 + i * 2) - 1, y - 4, 3, 3);
    }
  }

  ctx.fillStyle = light;
  if (weed.kind === "thistle") {
    for (let i = 0; i < 8; i += 1) {
      const angle = (Math.PI * 2 * i) / 8;
      ctx.fillRect(Math.cos(angle) * 8 - 2, -26 + Math.sin(angle) * 8 - 2, 5, 5);
    }
  } else {
    ctx.beginPath();
    ctx.arc(0, -22, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f3cf62";
    ctx.fillRect(-2, -24, 4, 4);
  }

  if (weed.hp < weed.maxHp) {
    ctx.fillStyle = "#1a0e08";
    ctx.fillRect(-20, 29, 40, 5);
    ctx.fillStyle = "#7fc153";
    ctx.fillRect(-19, 30, 38 * (weed.hp / weed.maxHp), 3);
  }
  ctx.restore();
}

function drawBoss() {
  const protectedNow = guardingWeeds() > 0;
  const pulse = 1 + Math.sin(elapsed * 3) * 0.025;
  ctx.save();
  ctx.translate(Math.round(boss.x), Math.round(boss.y));
  ctx.scale(pulse, pulse);

  ctx.globalAlpha = 0.42;
  ctx.fillStyle = "#120b05";
  ctx.beginPath();
  ctx.ellipse(0, 70, 74, 18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  if (protectedNow) {
    ctx.strokeStyle = "rgba(89, 238, 199, 0.25)";
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.arc(0, 0, boss.radius + 16 + Math.sin(elapsed * 5) * 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "#7ef0d0";
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 7]);
    ctx.lineDashOffset = -elapsed * 20;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.fillStyle = "#2a160a";
  ctx.strokeStyle = "#f2d086";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(0, 0, boss.radius + 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, boss.radius, 0, Math.PI * 2);
  ctx.clip();
  if (avatarReady) {
    const side = Math.min(avatar.naturalWidth, avatar.naturalHeight);
    const sx = (avatar.naturalWidth - side) / 2;
    const sy = (avatar.naturalHeight - side) / 2;
    ctx.drawImage(avatar, sx, sy, side, side, -boss.radius, -boss.radius, boss.radius * 2, boss.radius * 2);
  } else {
    const gradient = ctx.createLinearGradient(-50, -50, 50, 50);
    gradient.addColorStop(0, "#315f48");
    gradient.addColorStop(1, "#17261e");
    ctx.fillStyle = gradient;
    ctx.fillRect(-boss.radius, -boss.radius, boss.radius * 2, boss.radius * 2);
    ctx.fillStyle = "#e7d29e";
    ctx.font = "700 54px Cinzel, serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(targetName.slice(0, 1).toUpperCase(), 0, 4);
  }
  ctx.restore();

  ctx.strokeStyle = "#5d3414";
  ctx.lineWidth = 3;
  for (let i = 0; i < 8; i += 1) {
    const angle = (Math.PI * 2 * i) / 8 + elapsed * 0.08;
    const inner = boss.radius + 8;
    const outer = boss.radius + (i % 2 ? 19 : 14);
    ctx.beginPath();
    ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
    ctx.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
    ctx.stroke();
  }
  ctx.restore();
}

function drawPlayer() {
  if (invulnerable > 0 && Math.floor(invulnerable * 12) % 2 === 0) return;
  const bob = Math.sin(elapsed * 8) * 2;
  ctx.save();
  ctx.translate(Math.round(player.x), Math.round(player.y + bob));

  ctx.globalAlpha = 0.4;
  ctx.fillStyle = "#120b05";
  ctx.beginPath();
  ctx.ellipse(0, 20, 24, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.fillStyle = "#2d5c51";
  ctx.fillRect(-15, -7, 30, 28);
  ctx.fillStyle = "#55a292";
  ctx.fillRect(-11, -5, 8, 22);
  ctx.fillStyle = "#ead7a5";
  ctx.fillRect(-10, -25, 20, 18);
  ctx.fillStyle = "#56341c";
  ctx.fillRect(-13, -29, 26, 8);
  ctx.fillRect(-9, -34, 18, 7);
  ctx.fillStyle = "#1a140e";
  ctx.fillRect(-6, -20, 4, 4);
  ctx.fillRect(4, -20, 4, 4);

  ctx.fillStyle = "#c89242";
  ctx.fillRect(-5, -45, 10, 22);
  ctx.fillStyle = "#ffe383";
  ctx.fillRect(-3, -47, 6, 11);
  ctx.fillStyle = "#8a5223";
  ctx.fillRect(-8, -49, 16, 5);
  ctx.fillStyle = "#71e6c9";
  ctx.fillRect(-2, -54, 4, 6);

  ctx.fillStyle = "#392313";
  ctx.fillRect(-14, 21, 10, 5);
  ctx.fillRect(4, 21, 10, 5);
  ctx.restore();
}

function drawProjectile(projectile: Projectile) {
  ctx.save();
  ctx.translate(Math.round(projectile.x), Math.round(projectile.y));
  if (projectile.hostile) {
    ctx.fillStyle = "#793d87";
    ctx.shadowColor = "#b46ed0";
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(0, 0, projectile.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#dba6e9";
    ctx.fillRect(-2, -2, 4, 4);
  } else {
    ctx.fillStyle = "#ffe28a";
    ctx.shadowColor = "#ffb13b";
    ctx.shadowBlur = 16;
    ctx.fillRect(-3, -12, 6, 22);
    ctx.fillStyle = "#fff9d2";
    ctx.fillRect(-1, -15, 2, 10);
  }
  ctx.restore();
}

function draw() {
  ctx.save();
  if (screenShake > 0) {
    ctx.translate((Math.random() - 0.5) * screenShake, (Math.random() - 0.5) * screenShake);
  }
  drawBackground();
  drawBoss();
  const sortedWeeds = [...weeds].sort((a, b) => a.y - b.y);
  for (const weed of sortedWeeds) drawWeed(weed);
  for (const projectile of projectiles) drawProjectile(projectile);

  for (const particle of particles) {
    ctx.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1);
    ctx.fillStyle = particle.color;
    ctx.fillRect(
      Math.round(particle.x - particle.radius / 2),
      Math.round(particle.y - particle.radius / 2),
      Math.ceil(particle.radius),
      Math.ceil(particle.radius)
    );
  }
  ctx.globalAlpha = 1;
  drawPlayer();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "700 16px Cinzel, serif";
  for (const text of floatingTexts) {
    ctx.globalAlpha = clamp(text.life * 1.6, 0, 1);
    ctx.fillStyle = "#2a160a";
    ctx.fillText(text.text, text.x + 2, text.y + 2);
    ctx.fillStyle = text.color;
    ctx.fillText(text.text, text.x, text.y);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
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
  player.x = clamp(((event.clientX - rect.left) / rect.width) * WIDTH, 36, WIDTH - 36);
  player.y = clamp(((event.clientY - rect.top) / rect.height) * HEIGHT, 315, HEIGHT - 38);
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
background.addEventListener("load", draw);

bossHud.classList.add("hidden");
draw();
