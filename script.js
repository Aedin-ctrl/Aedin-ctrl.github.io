*{
margin:0;
padding:0;
box-sizing:border-box;
}

body{
font-family:'Outfit',sans-serif;
background: linear-gradient(120deg, #ffffff, #f4f4f4, #ffffff);
background-size: 200% 200%;
animation: gradientMove 18s ease infinite;
color:black;
overflow-x:hidden;
}

@keyframes gradientMove{
0%{background-position:0% 50%;}
50%{background-position:100% 50%;}
100%{background-position:0% 50%;}
}

/* SCROLL PROGRESS */

.scroll-progress{
position:fixed;
top:0;
left:0;
height:4px;
background:black;
width:0%;
z-index:999;
}

/* GRID CANVAS */

#gridCanvas{
position:fixed;
top:0;
left:0;
width:100%;
height:100%;
z-index:-2;
}

/* FLOAT BLOBS */

body::before{
content:"";
position:fixed;
width:600px;
height:600px;
background:radial-gradient(circle, rgba(0,0,0,0.05), transparent 70%);
top:-200px;
right:-200px;
z-index:-1;
}

/* TOP BAR */

.top-bar{
position:fixed;
top:0;
left:0;
width:100%;
height:70px;
display:flex;
justify-content:center;
align-items:center;
border-bottom:1px solid rgba(0,0,0,0.1);
background:white;
transform:translateY(-100%);
opacity:0;
transition:all 0.5s ease;
z-index:100;
}

.top-bar.show{
transform:translateY(0);
opacity:1;
}

.top-bar h3{
font-family:'Playfair Display',serif;
font-size:1.8rem;
}

/* HERO */

header{
height:80vh;
display:flex;
justify-content:center;
align-items:center;
flex-direction:column;
text-align:center;
transition:transform 0.4s ease;
}

h1{
font-family:'Playfair Display',serif;
font-size:clamp(4rem,9vw,7rem);
font-weight:800;
}

h2{
font-size:clamp(1.2rem,2.5vw,1.8rem);
font-weight:300;
}

/* MARQUEE */

.marquee{
overflow:hidden;
white-space:nowrap;
padding:20px 0;
border-top:1px solid rgba(0,0,0,0.1);
border-bottom:1px solid rgba(0,0,0,0.1);
}

.marquee-track{
display:inline-block;
animation:marqueeMove 15s linear infinite;
font-weight:500;
}

@keyframes marqueeMove{
0%{transform:translateX(0);}
100%{transform:translateX(-50%);}
}

/* BUTTON SECTION */

.button-section{
min-height:100vh;
display:flex;
justify-content:center;
align-items:center;
position:relative;
padding:60px 5vw;
}

.background-word{
position:absolute;
font-size:15vw;
opacity:0.03;
font-weight:800;
z-index:-1;
}

.grid{
width:100%;
max-width:1200px;
display:grid;
grid-template-columns:repeat(2,1fr);
gap:40px;
}

.btn{
border:2px solid black;
border-radius:20px;
padding:45px 30px;
font-size:2rem;
font-weight:600;
text-decoration:none;
color:black;
display:flex;
justify-content:center;
align-items:center;
transition:all 0.3s ease;
position:relative;
}

.btn:hover{
box-shadow:0 10px 30px rgba(0,0,0,0.15);
}

/* FADE IN */

.fade-in{
opacity:0;
transform:translateY(40px);
transition:all 1s ease;
}

.fade-in.visible{
opacity:1;
transform:translateY(0);
}

@media(max-width:900px){
.grid{
grid-template-columns:1fr;
}
}
