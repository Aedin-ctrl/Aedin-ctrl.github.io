console.log("Website Loaded");

/* ---------- HEADER SHRINK ---------- */

const hero = document.getElementById('hero');
const topBar = document.getElementById('topBar');

window.addEventListener('scroll', () => {

    let scale = Math.max(0.65, 1 - window.scrollY / 900);
    hero.style.transform = `scale(${scale})`;

    if(window.scrollY > hero.offsetHeight * 0.6){
        topBar.classList.add("show");
    } else {
        topBar.classList.remove("show");
    }

});

/* ---------- LETTER SPLIT ---------- */

function applyWave(element){

    const words = element.innerText.split(" ");
    element.innerHTML = "";

    words.forEach(word => {

        const wordSpan = document.createElement("span");
        wordSpan.style.marginRight = "8px";

        [...word].forEach((letter,index) => {

            const span = document.createElement("span");
            span.textContent = letter;
            span.classList.add("wave-letter");
            span.style.animationDelay = `${index * 0.3}s`;

            wordSpan.appendChild(span);
        });

        element.appendChild(wordSpan);
    });
}

applyWave(document.getElementById("waveText"));

document.querySelectorAll(".btnText").forEach(el=>{
    applyWave(el);
});


/* ---------- WARP GRID BACKGROUND ---------- */

const canvas = document.getElementById("bgGrid");
const ctx = canvas.getContext("2d");

let width, height;
let mouse = { x: -9999, y: -9999 }; // start off-screen so it doesn't glitch

function resize(){
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
}
resize();
window.addEventListener("resize", resize);

window.addEventListener("mousemove", e => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
});

const spacing = 40;
const influenceRadius = 90;

function drawGrid(){

    ctx.clearRect(0,0,width,height);
    ctx.strokeStyle = "rgba(0,0,0,0.25)"; // visible for testing
    ctx.lineWidth = 1;

    // vertical lines
    for(let x = 0; x <= width; x += spacing){
        ctx.beginPath();

        for(let y = 0; y <= height; y += 10){

            let dx = x - mouse.x;
            let dy = y - mouse.y;
            let dist = Math.sqrt(dx*dx + dy*dy);

            let offsetX = 0;

            if(dist < influenceRadius){
                let force = 1 - (dist / influenceRadius);
                offsetX = -dx * force * 0.15;
            }

            ctx.lineTo(x + offsetX, y);
        }

        ctx.stroke();
    }

    // horizontal lines
    for(let y = 0; y <= height; y += spacing){
        ctx.beginPath();

        for(let x = 0; x <= width; x += 10){

            let dx = x - mouse.x;
            let dy = y - mouse.y;
            let dist = Math.sqrt(dx*dx + dy*dy);

            let offsetY = 0;

            if(dist < influenceRadius){
                let force = 1 - (dist / influenceRadius);
                offsetY = -dy * force * 0.15;
            }

            ctx.lineTo(x, y + offsetY);
        }

        ctx.stroke();
    }

    requestAnimationFrame(drawGrid);
}

drawGrid();
