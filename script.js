console.log("Website Loaded");

/* HEADER SHRINK + TOP BAR */

const hero = document.getElementById('hero');
const topBar = document.getElementById('topBar');
const progressBar = document.querySelector('.scroll-progress');

window.addEventListener('scroll', () => {

let scale = Math.max(0.7, 1 - window.scrollY / 900);
hero.style.transform = `scale(${scale})`;

if(window.scrollY > hero.offsetHeight * 0.6){
topBar.classList.add("show");
}else{
topBar.classList.remove("show");
}

let scrollPercent = (window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100;
progressBar.style.width = scrollPercent + "%";
});

/* FADE IN */

const faders = document.querySelectorAll(".fade-in");

const observer = new IntersectionObserver(entries=>{
entries.forEach(entry=>{
if(entry.isIntersecting){
entry.target.classList.add("visible");
}
});
},{threshold:0.2});

faders.forEach(el=>observer.observe(el));

/* MAGNETIC BUTTONS */

document.querySelectorAll(".btn").forEach(btn=>{
btn.addEventListener("mousemove",(e)=>{
const rect = btn.getBoundingClientRect();
const x = e.clientX - rect.left - rect.width/2;
const y = e.clientY - rect.top - rect.height/2;
btn.style.transform = `translate(${x*0.2}px, ${y*0.2}px)`;
});
btn.addEventListener("mouseleave",()=>{
btn.style.transform = "translate(0,0)";
});
});

/* WARP GRID */

const canvas = document.getElementById("gridCanvas");
const ctx = canvas.getContext("2d");

let mouse = {x:null,y:null};
const spacing = 40;
const influenceRadius = 80;

function resizeCanvas(){
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener("resize", resizeCanvas);

window.addEventListener("mousemove",(e)=>{
mouse.x = e.clientX;
mouse.y = e.clientY;
});

function drawGrid(){
ctx.clearRect(0,0,canvas.width,canvas.height);
ctx.strokeStyle = "rgba(0,0,0,0.15)";
ctx.lineWidth = 1;

for(let x=0;x<canvas.width;x+=spacing){
ctx.beginPath();
for(let y=0;y<canvas.height;y+=spacing){
let dx = x - mouse.x;
let dy = y - mouse.y;
let dist = Math.sqrt(dx*dx+dy*dy);

let offsetX=0;
let offsetY=0;

if(dist<influenceRadius){
let force = (influenceRadius-dist)/influenceRadius;
offsetX = -dx * force * 0.08;
offsetY = -dy * force * 0.08;
}

ctx.lineTo(x+offsetX,y+offsetY);
}
ctx.stroke();
}

for(let y=0;y<canvas.height;y+=spacing){
ctx.beginPath();
for(let x=0;x<canvas.width;x+=spacing){
let dx = x - mouse.x;
let dy = y - mouse.y;
let dist = Math.sqrt(dx*dx+dy*dy);

let offsetX=0;
let offsetY=0;

if(dist<influenceRadius){
let force = (influenceRadius-dist)/influenceRadius;
offsetX = -dx * force * 0.08;
offsetY = -dy * force * 0.08;
}

ctx.lineTo(x+offsetX,y+offsetY);
}
ctx.stroke();
}

requestAnimationFrame(drawGrid);
}

drawGrid();
