window.FABRadial = (() => {

    let isOpen = false;
  
    function toggle() {
      const menu = document.getElementById('fabRadialMenu');
      if (!menu) return;
  
      isOpen = !isOpen;
      menu.classList.toggle('open', isOpen);
    }
  
    function close() {
      const menu = document.getElementById('fabRadialMenu');
      if (!menu) return;
      isOpen = false;
      menu.classList.remove('open');
    }
  
    function init(actions = []) {
      const container = document.getElementById('fabRadialMenu');
      if (!container) return;
  
      container.innerHTML = `
        <div class="fab-main" id="fabMain">＋</div>
        ${actions.map((a, i) => `
          <div class="fab-item" data-index="${i}">
            ${a.icon}
            <span>${a.label}</span>
          </div>
        `).join('')}
      `;
  
      document.getElementById('fabMain').onclick = toggle;
  
      container.querySelectorAll('.fab-item').forEach((el, i) => {
        el.onclick = () => {
          actions[i].action();
          close();
        };
      });
  
      document.addEventListener('click', (e) => {
        if (!e.target.closest('#fabRadialMenu')) {
          close();
        }
      });
    }
  
    return { init, close };
  
  })();