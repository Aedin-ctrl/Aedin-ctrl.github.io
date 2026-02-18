console.log("Website Loaded");

const hero = document.getElementById('hero');
const topBar = document.getElementById('topBar');
const progressBar = document.querySelector('.scroll-progress');

window.addEventListener('scroll', () => {

let scale = Math.max(0.65, 1 - window.scrollY / 900);
hero.style.transform = `scale(${scale})`;

if(window.scrollY > hero.offsetHeight * 0.6){
topBar.classList.add("show");
}else{
topBar.classList.remove("show");
}

/* Scroll Progress */
let scrollPercent = 
(window.scrollY / 
(document.body.scrollHeight - window.innerHeight)) * 100;

progressBar.style.width = scrollPercent + "%";

});
