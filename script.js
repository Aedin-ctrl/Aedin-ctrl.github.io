console.log("Website Loaded");

/* ---------- WARP GRID BACKGROUND ---------- */
const canvas = document.getElementById("bgGrid");
const ctx = canvas.getContext("2d");

let width, height;
let mouse = { x: null, y: null };

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

const spacing = 40;          // distance between grid lines
const influenceRadius = 120; // how far mouse affects grid
const strength = 15;         // warp strength

function drawGrid(){
    ctx.clearRect(0,0,width,height);
    ctx.strokeStyle = "rgba(0,0,0,0.08)";
    ctx.lineWidth = 1;

    for(let x = 0; x <= width; x += spacing){
        ctx.beginPath();
        for(let y = 0; y <= height; y += 5){

            let dx = x - mouse.x;
            let dy = y - mouse.y;
            let dist = Math.sqrt(dx*dx + dy*dy);

            let offsetX = 0;

            if(dist < influenceRadius){
                let force = (1 - dist / influenceRadius);
                offsetX = dx * force * 0.15;
            }

            ctx.lineTo(x + offsetX, y);
        }
        ctx.stroke();
    }

    for(let y = 0; y <= height; y += spacing){
        ctx.beginPath();
        for(let x = 0; x <= width; x += 5){

            let dx = x - mouse.x;
            let dy = y - mouse.y;
            let dist = Math.sqrt(dx*dx + dy*dy);

            let offsetY = 0;

            if(dist < influenceRadius){
                let force = (1 - dist / influenceRadius);
                offsetY = dy * force * 0.15;
            }

            ctx.lineTo(x, y + offsetY);
        }
        ctx.stroke();
    }

    requestAnimationFrame(drawGrid);
}

drawGrid();
