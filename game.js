const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const playerImg = new Image();
playerImg.src = "images/frog.png";

const monsterImg = new Image();
monsterImg.src = "images/slime.png";

const tongueImg = new Image();
tongueImg.src = "images/tongue.png";

const shootSound = new Audio("sounds/slurpAudio.mp3");
shootSound.loop = true;

const player = {
  x: 380,
  y: 400,
  width: 40,
  height: 40,
  speed: 5
};

const keys = {};

const mouse = {
  x: 0,
  y: 0
};

let attacking = false;
let tongueLength = 0;
const maxTongueLength = 80;

canvas.addEventListener("mousemove", (e) => {
  const rect = canvas.getBoundingClientRect();
  mouse.x = e.clientX - rect.left;
  mouse.y = e.clientY - rect.top;
});

canvas.addEventListener("mousedown", (e) => {
  if (e.button === 0) {
    attacking = true;
    shootSound.currentTime = 0;
    shootSound.play();
  }
});

canvas.addEventListener("mouseup", (e) => {
  if (e.button === 0) {
    attacking = false;

    shootSound.pause();
    shootSound.currentTime = 0;
  }
});

document.addEventListener("keydown", function(event) {
  keys[event.key] = true;
});

document.addEventListener("keyup", function(event) {
  keys[event.key] = false;
});

function update() {
  if (keys["a"] || keys["ArrowLeft"]) player.x -= player.speed;
  if (keys["d"] || keys["ArrowRight"]) player.x += player.speed;
  if (keys["w"] || keys["ArrowUp"]) player.y -= player.speed;
  if (keys["s"] || keys["ArrowDown"]) player.y += player.speed;

  if (attacking) {
    tongueLength = maxTongueLength;
  } else {
    tongueLength = 0;
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.drawImage(playerImg, player.x, player.y, player.width, player.height);

  if (tongueLength > 0) {
    const frogCenterX = player.x + player.width / 2;
    const frogCenterY = player.y + player.height / 2;

    const angle = Math.atan2(
      mouse.y - frogCenterY,
      mouse.x - frogCenterX
    );

    ctx.save();
    ctx.translate(frogCenterX, frogCenterY);
    ctx.rotate(angle);

    ctx.drawImage(
      tongueImg,
      0,
      -8,
      tongueLength,
      16
    );

    ctx.restore();
  }
}

function gameLoop() {
  update();
  draw();
  requestAnimationFrame(gameLoop);
}

gameLoop();