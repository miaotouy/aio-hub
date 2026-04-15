// Canvas Script
console.log("Canvas loaded!");

document.addEventListener('DOMContentLoaded', () => {
  const title = document.querySelector('h1');
  if (title) {
    console.log("Found title:", title.textContent);
  }
});